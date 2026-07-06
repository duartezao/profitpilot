import "server-only";
import type { Types } from "mongoose";
import { ManualCogsDay } from "@/models/ManualCogsDay";
import { Order } from "@/models/Order";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import {
  addDays,
  formatDateInput,
  parseDateInput,
  startOfDay,
  orderDateMatch,
} from "@/lib/period";
import { convertToBaseCurrency } from "@/lib/fx";
import { buildOrderAmountsBase } from "@/lib/order-money";
import {
  COGS_INPUT_CURRENCIES,
  isCogsInputCurrency,
  type CogsInputCurrency,
  type CogsMode,
} from "@/lib/cogs-modes";
import {
  dayKeysBetweenInTimezone,
  dateKeyInTimezone,
  normalizeStoreTimezone,
  orderDateMatchInTimezone,
} from "@/lib/store-timezone";
import type { PeriodSlice } from "@/lib/ad-spend";
import { countSoldVariantsMissingCost } from "@/lib/cogs";

export { COGS_INPUT_CURRENCIES, isCogsInputCurrency };
export type { CogsInputCurrency };

export const COGS_LOOKBACK_DAYS = 60;

export type CogsDayRow = {
  dateKey: string;
  label: string;
  amount: number | null;
  inputAmount: number | null;
  inputCurrency: string | null;
  fxRate: number | null;
  baseCurrency: string;
  hasOrders: boolean;
  isYesterday: boolean;
  note?: string;
  revisionAt: string | null;
};

export type OrderCogsRow = {
  orderId: string;
  shopifyId: string;
  name: string;
  orderDate: string;
  dateLabel: string;
  netRevenue: number;
  manualCogs: number | null;
  inputAmount: number | null;
  inputCurrency: string | null;
  fxRate: number | null;
  baseCurrency: string;
  missing: boolean;
};

export function resolveCogsRange(
  importStartDate?: Date | null,
  storeCreatedAt?: Date | null,
): { from: Date; to: Date; fromKey: string; toKey: string } {
  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);

  let from: Date;
  if (importStartDate) {
    from = startOfDay(new Date(importStartDate));
  } else if (storeCreatedAt) {
    from = startOfDay(new Date(storeCreatedAt));
  } else {
    from = addDays(today, -COGS_LOOKBACK_DAYS);
  }

  if (from > yesterday) from = yesterday;

  return {
    from,
    to: yesterday,
    fromKey: formatDateInput(from),
    toKey: formatDateInput(yesterday),
  };
}

function formatDayLabel(dateKey: string): string {
  const d = parseDateInput(dateKey);
  if (!d) return dateKey;
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

export async function getBaseCurrency(workspaceId: Types.ObjectId | string): Promise<string> {
  const ws = await Workspace.findById(workspaceId).select("baseCurrency").lean();
  return ws?.baseCurrency ?? "EUR";
}

export async function saveManualCogsDay(
  workspaceId: Types.ObjectId,
  storeId: Types.ObjectId,
  dateKey: string,
  inputAmount: number,
  inputCurrency: CogsInputCurrency,
  userId?: Types.ObjectId | null,
  note?: string,
): Promise<void> {
  const baseCurrency = await getBaseCurrency(workspaceId);
  const fx = await convertToBaseCurrency(inputAmount, inputCurrency, baseCurrency, dateKey);

  await ManualCogsDay.updateOne(
    { storeId, dateKey },
    {
      $set: {
        workspaceId,
        amount: fx.amountBase,
        currency: baseCurrency,
        inputAmount: fx.inputAmount,
        inputCurrency: fx.inputCurrency,
        fxRate: fx.fxRate,
        note: note ?? "",
        updatedBy: userId ?? null,
      },
    },
    { upsert: true },
  );
}

export async function saveManualOrderCogs(
  workspaceId: Types.ObjectId,
  orderId: Types.ObjectId,
  inputAmount: number,
  inputCurrency: CogsInputCurrency,
): Promise<void> {
  const order = await Order.findOne({ _id: orderId, workspaceId })
    .select(
      "storeId orderDate subtotal totalPrice refunded netRevenue shipping fees cogs currency",
    )
    .lean();
  if (!order) throw new Error("Encomenda não encontrada.");

  const store = await Store.findById(order.storeId)
    .select("ianaTimezone currency")
    .lean();
  const baseCurrency = await getBaseCurrency(workspaceId);
  const dateKey = dateKeyInTimezone(
    new Date(order.orderDate),
    normalizeStoreTimezone(store?.ianaTimezone),
  );
  const fx = await convertToBaseCurrency(inputAmount, inputCurrency, baseCurrency, dateKey);

  const amountsBase = await buildOrderAmountsBase(
    {
      subtotal: order.subtotal,
      totalPrice: order.totalPrice,
      refunded: order.refunded,
      netRevenue: order.netRevenue,
      cogs: fx.amountBase,
      shipping: order.shipping,
      fees: order.fees,
    },
    (store?.currency ?? order.currency ?? "EUR").toUpperCase(),
    baseCurrency,
    new Date(order.orderDate),
    store?.ianaTimezone,
    fx.amountBase,
  );

  await Order.updateOne(
    { _id: orderId },
    {
      $set: {
        manualCogs: fx.amountBase,
        manualCogsInputAmount: fx.inputAmount,
        manualCogsInputCurrency: fx.inputCurrency,
        manualCogsFxRate: fx.fxRate,
        amountsBase,
      },
    },
  );
}

export async function clearManualOrderCogs(
  workspaceId: Types.ObjectId,
  orderId: Types.ObjectId,
): Promise<void> {
  await Order.updateOne(
    { _id: orderId, workspaceId },
    {
      $set: {
        manualCogs: null,
        manualCogsInputAmount: null,
        manualCogsInputCurrency: null,
        manualCogsFxRate: null,
      },
      $unset: { "amountsBase.cogs": "" },
    },
  );
}

export async function buildCogsDayRows(
  store: {
    _id: Types.ObjectId;
    workspaceId: Types.ObjectId;
    importStartDate?: Date | null;
    createdAt?: Date | null;
    ianaTimezone?: string | null;
  },
  baseCurrency: string,
): Promise<CogsDayRow[]> {
  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const { from, to, toKey } = resolveCogsRange(store.importStartDate, store.createdAt);
  const dayKeys = dayKeysBetweenInTimezone(from, to, tz);
  const yesterdayKey = dayKeys[dayKeys.length - 1] ?? toKey;

  const [manualRows, orderDays] = await Promise.all([
    ManualCogsDay.find({ storeId: store._id, dateKey: { $in: dayKeys } }).lean(),
    Order.aggregate<{ _id: string }>([
      { $match: { storeId: store._id } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$orderDate",
              timezone: tz,
            },
          },
        },
      },
    ]),
  ]);

  const manualMap = new Map(manualRows.map((r) => [r.dateKey, r]));
  const orderDaySet = new Set(orderDays.map((r) => r._id));

  return dayKeys.map((dateKey) => {
    const m = manualMap.get(dateKey);
    return {
      dateKey,
      label: formatDayLabel(dateKey),
      amount: m?.amount ?? null,
      inputAmount: m?.inputAmount ?? null,
      inputCurrency: m?.inputCurrency ?? null,
      fxRate: m?.fxRate ?? null,
      baseCurrency,
      hasOrders: orderDaySet.has(dateKey),
      isYesterday: dateKey === yesterdayKey,
      note: m?.note ?? "",
      revisionAt: m?.updatedAt ? new Date(m.updatedAt).toISOString() : null,
    };
  });
}

export async function listOrdersForCogsPanel(
  storeId: Types.ObjectId,
  limit = 80,
): Promise<OrderCogsRow[]> {
  const store = await Store.findById(storeId)
    .select("workspaceId ianaTimezone")
    .lean();
  if (!store) return [];

  const baseCurrency = await getBaseCurrency(store.workspaceId);
  const tz = normalizeStoreTimezone(store.ianaTimezone);

  const orders = await Order.find({ storeId })
    .select(
      "name shopifyId orderDate netRevenue manualCogs manualCogsInputAmount manualCogsInputCurrency manualCogsFxRate amountsBase",
    )
    .sort({ orderDate: -1 })
    .limit(limit)
    .lean();

  return orders.map((o) => {
    const missing = o.manualCogs == null;
    const d = new Date(o.orderDate);
    return {
      orderId: String(o._id),
      shopifyId: o.shopifyId,
      name: o.name ?? o.shopifyId,
      orderDate: dateKeyInTimezone(d, tz),
      dateLabel: new Intl.DateTimeFormat("pt-PT", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(d),
      netRevenue: o.amountsBase?.netRevenue ?? o.netRevenue ?? 0,
      manualCogs: o.manualCogs ?? null,
      inputAmount: o.manualCogsInputAmount ?? null,
      inputCurrency: o.manualCogsInputCurrency ?? null,
      fxRate: o.manualCogsFxRate ?? null,
      baseCurrency,
      missing,
    };
  });
}

export async function sumManualCogsForPeriod(
  storeIds: Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<number> {
  if (!storeIds.length) return 0;

  let dayKeys: string[];
  if (slice.specificDates?.length) {
    dayKeys = [...slice.specificDates];
  } else if (storeTimeZone) {
    dayKeys = dayKeysBetweenInTimezone(
      slice.start,
      slice.end,
      normalizeStoreTimezone(storeTimeZone),
    );
  } else {
    dayKeys = [];
    let cur = startOfDay(slice.start);
    const end = startOfDay(slice.end);
    while (cur <= end) {
      dayKeys.push(formatDateInput(cur));
      cur = addDays(cur, 1);
    }
  }

  if (!dayKeys.length) return 0;

  const rows = await ManualCogsDay.aggregate<{ total: number }>([
    { $match: { storeId: { $in: storeIds }, dateKey: { $in: dayKeys } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return rows[0]?.total ?? 0;
}

export async function sumManualCogsByDay(
  storeId: Types.ObjectId,
  dayKeys: string[],
): Promise<Map<string, number>> {
  if (!dayKeys.length) return new Map();

  const rows = await ManualCogsDay.find({
    storeId,
    dateKey: { $in: dayKeys },
  })
    .select("dateKey amount")
    .lean();

  return new Map(rows.map((r) => [r.dateKey, r.amount]));
}

export async function countMissingCogsDays(
  store: {
    _id: Types.ObjectId;
    workspaceId: Types.ObjectId;
    importStartDate?: Date | null;
    createdAt?: Date | null;
    ianaTimezone?: string | null;
  },
): Promise<number> {
  const baseCurrency = await getBaseCurrency(store.workspaceId);
  const rows = await buildCogsDayRows(store, baseCurrency);
  return rows.filter((r) => r.hasOrders && r.amount === null).length;
}

/** Soma COGS em falta respeitando o modo de cada loja. */
export async function countMissingCogsForStores(
  stores: Array<Parameters<typeof countMissingCogsForStore>[0]>,
  period?: PeriodSlice,
): Promise<number> {
  let total = 0;
  for (const store of stores) {
    total += await countMissingCogsForStore(store, period);
  }
  return total;
}

export function formatMissingCogsWarning(
  count: number,
  mode?: CogsMode | null,
): string {
  if (count <= 0) return "";
  const detail = mode
    ? cogsMissingLabel(mode, count)
    : `${count} ${count === 1 ? "entrada de COGS em falta" : "entradas de COGS em falta"}`;
  return `${detail} neste período.`;
}

/** Conta COGS em falta conforme o modo configurado na loja. */
export async function countMissingCogsForStore(
  store: {
    _id: Types.ObjectId;
    workspaceId: Types.ObjectId;
    cogsMode?: string | null;
    importStartDate?: Date | null;
    createdAt?: Date | null;
    ianaTimezone?: string | null;
  },
  period?: PeriodSlice,
): Promise<number> {
  const mode = (store.cogsMode ?? "shopify") as CogsMode;
  const tz = normalizeStoreTimezone(store.ianaTimezone);
  if (mode === "order") {
    if (!period) return 0;
    return countOrdersMissingManualCogs([store._id], period, tz);
  }
  if (mode === "day") {
    return countMissingCogsDays(store);
  }
  if (!period) return 0;
  return countSoldVariantsMissingCost([store._id], period);
}

export function cogsMissingLabel(
  mode: CogsMode,
  count: number,
): string {
  if (count <= 0) return "";
  if (mode === "order") {
    return `${count} ${count === 1 ? "encomenda sem COGS" : "encomendas sem COGS"}`;
  }
  if (mode === "day") {
    return `${count} ${count === 1 ? "dia com vendas sem COGS" : "dias com vendas sem COGS"}`;
  }
  return `${count} ${count === 1 ? "produto vendido sem custo" : "produtos vendidos sem custo"}`;
}

export async function countOrdersMissingManualCogs(
  storeIds: Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<number> {
  if (!storeIds.length) return 0;

  const match: Record<string, unknown> = {
    storeId: { $in: storeIds },
    manualCogs: null,
    ...(storeTimeZone
      ? orderDateMatchInTimezone(slice, storeTimeZone)
      : orderDateMatch(slice)),
  };

  return Order.countDocuments(match);
}
