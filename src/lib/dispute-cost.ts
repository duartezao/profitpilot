import "server-only";
import type { Types } from "mongoose";
import { Dispute } from "@/models/Dispute";
import { Order } from "@/models/Order";
import { orderDateMatch, type ResolvedPeriod } from "@/lib/period";
import {
  dateKeyInTimezone,
  orderDateMatchInTimezone,
} from "@/lib/store-timezone";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type DateSlice = Pick<ResolvedPeriod, "start" | "end" | "specificDates">;

/** Disputa ganha pelo merchant — montante já não é custo. */
export function disputeCountsAsCost(status?: string | null): boolean {
  const s = (status ?? "").toLowerCase().replace(/-/g, "_");
  return s !== "won";
}

/**
 * Chargeback efectivo: montante da disputa menos reembolso já reflectido
 * na encomenda (evita dupla contagem quando a Shopify depois marca refund).
 */
export function effectiveChargebackAmount(
  disputeAmount: number,
  orderRefunded: number,
): number {
  return Math.max(0, num(disputeAmount) - num(orderRefunded));
}

function initiatedAtMatch(
  slice: DateSlice,
  storeTz?: string | null,
): Record<string, unknown> {
  if (storeTz) {
    const m = orderDateMatchInTimezone(slice, storeTz);
    if ("orderDate" in m) return { initiatedAt: m.orderDate };
    if ("$or" in m) {
      return {
        $or: (m.$or as Array<{ orderDate: unknown }>).map((clause) => ({
          initiatedAt: clause.orderDate,
        })),
      };
    }
  }
  const m = orderDateMatch(slice);
  if ("orderDate" in m) return { initiatedAt: m.orderDate };
  if ("$or" in m) {
    return {
      $or: (m.$or as Array<{ orderDate: unknown }>).map((clause) => ({
        initiatedAt: clause.orderDate,
      })),
    };
  }
  return {
    initiatedAt: { $gte: slice.start, $lte: slice.end },
  };
}

type DisputeLean = {
  storeId: Types.ObjectId;
  amount?: number | null;
  status?: string | null;
  orderShopifyId?: string | null;
  initiatedAt: Date;
};

async function netChargebacksFromDisputes(
  disputes: DisputeLean[],
  storeIds: Types.ObjectId[],
): Promise<{ byStore: Map<string, number>; total: number }> {
  const byStore = new Map<string, number>();
  if (!disputes.length) return { byStore, total: 0 };

  const orderIds = [
    ...new Set(
      disputes
        .map((d) => d.orderShopifyId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const refundByOrder = new Map<string, number>();
  if (orderIds.length) {
    const orders = await Order.find({
      storeId: { $in: storeIds },
      shopifyId: { $in: orderIds },
    })
      .select("shopifyId refunded")
      .lean();
    for (const o of orders) {
      refundByOrder.set(String(o.shopifyId), num(o.refunded));
    }
  }

  let total = 0;
  for (const d of disputes) {
    if (!disputeCountsAsCost(d.status)) continue;
    const effective = effectiveChargebackAmount(
      num(d.amount),
      d.orderShopifyId ? (refundByOrder.get(d.orderShopifyId) ?? 0) : 0,
    );
    if (effective <= 0.009) continue;
    total += effective;
    const sid = String(d.storeId);
    byStore.set(sid, (byStore.get(sid) ?? 0) + effective);
  }
  return { byStore, total };
}

/** Soma chargebacks (custo) por loja no período — exclui WON e reembolsos já na order. */
export async function sumChargebacksByStore(
  storeIds: Types.ObjectId[],
  slice: DateSlice,
  storeTz?: string | null,
): Promise<Map<string, number>> {
  if (!storeIds.length) return new Map();
  const disputes = await Dispute.find({
    storeId: { $in: storeIds },
    ...initiatedAtMatch(slice, storeTz),
  })
    .select("storeId amount status orderShopifyId initiatedAt")
    .lean();
  const { byStore } = await netChargebacksFromDisputes(disputes, storeIds);
  return byStore;
}

/** Soma chargebacks de uma loja num dia/período. */
export async function sumChargebacksForStoreDay(
  storeId: Types.ObjectId,
  slice: DateSlice,
  storeTz: string,
): Promise<number> {
  const map = await sumChargebacksByStore([storeId], slice, storeTz);
  return map.get(String(storeId)) ?? 0;
}

/** Chargebacks por dia civil (fuso da loja) no período. */
export async function sumChargebacksByDayKey(
  storeIds: Types.ObjectId[],
  slice: DateSlice,
  storeTz: string,
): Promise<Map<string, number>> {
  const byDay = new Map<string, number>();
  if (!storeIds.length) return byDay;

  const disputes = await Dispute.find({
    storeId: { $in: storeIds },
    ...initiatedAtMatch(slice, storeTz),
  })
    .select("storeId amount status orderShopifyId initiatedAt")
    .lean();

  const orderIds = [
    ...new Set(
      disputes
        .map((d) => d.orderShopifyId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const refundByOrder = new Map<string, number>();
  if (orderIds.length) {
    const orders = await Order.find({
      storeId: { $in: storeIds },
      shopifyId: { $in: orderIds },
    })
      .select("shopifyId refunded")
      .lean();
    for (const o of orders) {
      refundByOrder.set(String(o.shopifyId), num(o.refunded));
    }
  }

  for (const d of disputes) {
    if (!disputeCountsAsCost(d.status)) continue;
    const effective = effectiveChargebackAmount(
      num(d.amount),
      d.orderShopifyId ? (refundByOrder.get(d.orderShopifyId) ?? 0) : 0,
    );
    if (effective <= 0.009) continue;
    const dayKey = dateKeyInTimezone(new Date(d.initiatedAt), storeTz);
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + effective);
  }
  return byDay;
}

/** Total de chargebacks no período. */
export async function sumChargebacksTotal(
  storeIds: Types.ObjectId[],
  slice: DateSlice,
  storeTz?: string | null,
): Promise<number> {
  const byStore = await sumChargebacksByStore(storeIds, slice, storeTz);
  let total = 0;
  for (const v of byStore.values()) total += v;
  return total;
}
