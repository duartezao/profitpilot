import "server-only";
import type { Types } from "mongoose";
import { mergePaidOrderFilter } from "@/lib/order-financial-status";
import {
  grossRevenueSumBaseExpr,
  refundsSumBaseExpr,
} from "@/lib/order-money";
import type { PeriodSlice } from "@/lib/ad-spend";
import {
  normalizeStoreTimezone,
  orderDateMatchInTimezone,
  zonedDateMatchInTimezone,
} from "@/lib/store-timezone";
import { orderDateMatch } from "@/lib/period";
import { Order } from "@/models/Order";

export type DailyOrderAgg = {
  revenue: number;
  cogs: number;
  shipping: number;
  fees: number;
  refunds: number;
  orders: number;
};

const zeroAgg = (): DailyOrderAgg => ({
  revenue: 0,
  cogs: 0,
  shipping: 0,
  fees: 0,
  refunds: 0,
  orders: 0,
});

/** REV bruta por dia de venda (antes de reembolsos). */
export { grossRevenueSumBaseExpr };

/**
 * Junta vendas (dia da encomenda) com reembolsos (dia de emissão).
 * `orderByDay.revenue` deve ser REV bruta; `refundByDay` = reembolsos emitidos nesse dia.
 */
export function mergeDailyAggWithRefundIssuance(
  orderByDay: Map<string, DailyOrderAgg>,
  refundByDay: Map<string, number>,
): Map<string, DailyOrderAgg> {
  const keys = new Set([...orderByDay.keys(), ...refundByDay.keys()]);
  const out = new Map<string, DailyOrderAgg>();
  for (const key of keys) {
    const o = orderByDay.get(key) ?? zeroAgg();
    const issued = refundByDay.get(key) ?? 0;
    out.set(key, {
      ...o,
      revenue: o.revenue - issued,
      refunds: issued,
      orders: o.orders ?? 0,
    });
  }
  return out;
}

/**
 * Reembolsos por dia civil de emissão (Shopify `refund.createdAt`).
 * Encomendas antigas sem `refundLines` mantêm fallback na data da encomenda.
 */
export async function aggregateDailyRefundsIssued(
  wsId: Types.ObjectId,
  storeOids: Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<Map<string, number>> {
  const storeFilter =
    storeOids.length === 1
      ? { storeId: storeOids[0] }
      : storeOids.length > 1
        ? { storeId: { $in: storeOids } }
        : {};

  const baseMatch = mergePaidOrderFilter({
    workspaceId: wsId,
    ...storeFilter,
  });

  const tz = storeTimeZone ? normalizeStoreTimezone(storeTimeZone) : null;
  const refundDateMatch = tz
    ? zonedDateMatchInTimezone("refundLines.refundedAt", slice, tz)
    : { "refundLines.refundedAt": { $gte: slice.start, $lte: slice.end } };

  const lineRows = await Order.aggregate<{ _id: string; refunds: number }>([
    { $match: { ...baseMatch, refundLines: { $exists: true, $ne: [] } } },
    { $unwind: "$refundLines" },
    { $match: refundDateMatch },
    {
      $group: {
        _id: tz
          ? {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$refundLines.refundedAt",
                timezone: tz,
              },
            }
          : {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$refundLines.refundedAt",
              },
            },
        refunds: {
          $sum: {
            $ifNull: ["$refundLines.amountBase", "$refundLines.amount"],
          },
        },
      },
    },
  ]);

  const legacyOrderMatch = {
    ...baseMatch,
    refunded: { $gt: 0 },
    $or: [{ refundLines: { $exists: false } }, { refundLines: { $size: 0 } }],
    ...(tz ? orderDateMatchInTimezone(slice, tz) : orderDateMatch(slice)),
  };

  const legacyRows = await Order.aggregate<{ _id: string; refunds: number }>([
    { $match: legacyOrderMatch },
    {
      $group: {
        _id: tz
          ? {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$orderDate",
                timezone: tz,
              },
            }
          : {
              $dateToString: { format: "%Y-%m-%d", date: "$orderDate" },
            },
        refunds: refundsSumBaseExpr,
      },
    },
  ]);

  const map = new Map<string, number>();
  for (const r of lineRows) {
    map.set(r._id, (map.get(r._id) ?? 0) + r.refunds);
  }
  for (const r of legacyRows) {
    map.set(r._id, (map.get(r._id) ?? 0) + r.refunds);
  }
  return map;
}

/** Reembolsos emitidos por loja + dia (`dateKey:storeId`). */
export async function aggregateDailyRefundsIssuedByStore(
  wsId: Types.ObjectId,
  storeOids: Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone: string,
): Promise<Map<string, number>> {
  const tz = normalizeStoreTimezone(storeTimeZone);
  const baseMatch = mergePaidOrderFilter({
    workspaceId: wsId,
    storeId: { $in: storeOids },
  });
  const refundDateMatch = zonedDateMatchInTimezone(
    "refundLines.refundedAt",
    slice,
    tz,
  );

  const dateExpr = {
    $dateToString: {
      format: "%Y-%m-%d",
      date: "$refundLines.refundedAt",
      timezone: tz,
    },
  };
  const orderDateExpr = {
    $dateToString: {
      format: "%Y-%m-%d",
      date: "$orderDate",
      timezone: tz,
    },
  };

  const lineRows = await Order.aggregate<{
    _id: { date: string; storeId: Types.ObjectId };
    refunds: number;
  }>([
    { $match: { ...baseMatch, refundLines: { $exists: true, $ne: [] } } },
    { $unwind: "$refundLines" },
    { $match: refundDateMatch },
    {
      $group: {
        _id: { date: dateExpr, storeId: "$storeId" },
        refunds: {
          $sum: {
            $ifNull: ["$refundLines.amountBase", "$refundLines.amount"],
          },
        },
      },
    },
  ]);

  const legacyRows = await Order.aggregate<{
    _id: { date: string; storeId: Types.ObjectId };
    refunds: number;
  }>([
    {
      $match: {
        ...baseMatch,
        refunded: { $gt: 0 },
        $or: [
          { refundLines: { $exists: false } },
          { refundLines: { $size: 0 } },
        ],
        ...orderDateMatchInTimezone(slice, tz),
      },
    },
    {
      $group: {
        _id: { date: orderDateExpr, storeId: "$storeId" },
        refunds: refundsSumBaseExpr,
      },
    },
  ]);

  const map = new Map<string, number>();
  const put = (date: string, storeId: Types.ObjectId, amount: number) => {
    const key = `${date}:${String(storeId)}`;
    map.set(key, (map.get(key) ?? 0) + amount);
  };
  for (const r of lineRows) {
    put(r._id.date, r._id.storeId, r.refunds);
  }
  for (const r of legacyRows) {
    put(r._id.date, r._id.storeId, r.refunds);
  }
  return map;
}

/** Total de reembolsos emitidos no período, agrupados por loja. */
export async function aggregateRefundsIssuedByStore(
  wsId: Types.ObjectId,
  storeOids: Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<Map<string, number>> {
  const storeFilter =
    storeOids.length === 1
      ? { storeId: storeOids[0] }
      : storeOids.length > 1
        ? { storeId: { $in: storeOids } }
        : {};

  const baseMatch = mergePaidOrderFilter({
    workspaceId: wsId,
    ...storeFilter,
  });

  const tz = storeTimeZone ? normalizeStoreTimezone(storeTimeZone) : null;
  const refundDateMatch = tz
    ? zonedDateMatchInTimezone("refundLines.refundedAt", slice, tz)
    : { "refundLines.refundedAt": { $gte: slice.start, $lte: slice.end } };

  const lineRows = await Order.aggregate<{
    _id: Types.ObjectId;
    refunds: number;
  }>([
    { $match: { ...baseMatch, refundLines: { $exists: true, $ne: [] } } },
    { $unwind: "$refundLines" },
    { $match: refundDateMatch },
    {
      $group: {
        _id: "$storeId",
        refunds: {
          $sum: {
            $ifNull: ["$refundLines.amountBase", "$refundLines.amount"],
          },
        },
      },
    },
  ]);

  const legacyOrderMatch = {
    ...baseMatch,
    refunded: { $gt: 0 },
    $or: [{ refundLines: { $exists: false } }, { refundLines: { $size: 0 } }],
    ...(tz ? orderDateMatchInTimezone(slice, tz) : orderDateMatch(slice)),
  };

  const legacyRows = await Order.aggregate<{
    _id: Types.ObjectId;
    refunds: number;
  }>([
    { $match: legacyOrderMatch },
    { $group: { _id: "$storeId", refunds: refundsSumBaseExpr } },
  ]);

  const map = new Map<string, number>();
  for (const r of lineRows) {
    map.set(String(r._id), (map.get(String(r._id)) ?? 0) + r.refunds);
  }
  for (const r of legacyRows) {
    map.set(String(r._id), (map.get(String(r._id)) ?? 0) + r.refunds);
  }
  return map;
}

export async function sumRefundsIssuedInPeriod(
  wsId: Types.ObjectId,
  storeOids: Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<number> {
  const byDay = await aggregateDailyRefundsIssued(
    wsId,
    storeOids,
    slice,
    storeTimeZone,
  );
  let total = 0;
  for (const v of byDay.values()) total += v;
  return total;
}
