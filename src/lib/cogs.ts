import "server-only";
import type { AnyBulkWriteOperation } from "mongoose";
import type { Types } from "mongoose";
import { Order } from "@/models/Order";
import { ProductCost } from "@/models/ProductCost";
import { CogsHistory } from "@/models/CogsHistory";
import { PriceHistory } from "@/models/PriceHistory";
import { orderDateMatch } from "@/lib/period";
import {
  orderDateMatchInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import {
  applyLineUnitCost,
  applyLineUnitPrice,
  type CostResolver,
} from "@/lib/line-snapshots";

export type CogsPeriodSlice = {
  start: Date;
  end: Date;
  specificDates?: string[];
};

function orderMatchForStores(
  storeIds: Types.ObjectId[],
  period?: CogsPeriodSlice,
): Record<string, unknown> {
  const match: Record<string, unknown> = { storeId: { $in: storeIds } };
  if (period) Object.assign(match, orderDateMatch(period));
  return match;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type HistoryEntry = {
  cost: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type SoldVariantMissingCost = {
  storeId: string;
  variantId: string;
  title: string;
  unitsSold: number;
  orderCount: number;
};

/** Variantes com vendas registadas mas sem custo nas linhas das encomendas. */
export async function listSoldVariantsMissingCost(
  storeIds: Types.ObjectId[],
): Promise<SoldVariantMissingCost[]> {
  if (!storeIds.length) return [];

  const rows = await Order.aggregate<{
    _id: { storeId: Types.ObjectId; variantId: string };
    title: string;
    unitsSold: number;
    orderCount: number;
  }>([
    { $match: { storeId: { $in: storeIds } } },
    { $unwind: "$lineItems" },
    {
      $match: {
        "lineItems.variantId": { $exists: true, $nin: ["", null] },
        "lineItems.unitCost": { $lte: 0 },
      },
    },
    {
      $group: {
        _id: { storeId: "$storeId", variantId: "$lineItems.variantId" },
        title: { $first: "$lineItems.title" },
        unitsSold: { $sum: "$lineItems.quantity" },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { unitsSold: -1 } },
    { $limit: 300 },
  ]);

  return rows.map((r) => ({
    storeId: String(r._id.storeId),
    variantId: String(r._id.variantId),
    title: r.title ?? "(sem nome)",
    unitsSold: num(r.unitsSold),
    orderCount: num(r.orderCount),
  }));
}

/** Conta variantes distintas vendidas sem custo (opcionalmente só no período). */
export async function countSoldVariantsMissingCost(
  storeIds: Types.ObjectId[],
  period?: CogsPeriodSlice,
): Promise<number> {
  if (!storeIds.length) return 0;

  const rows = await Order.aggregate<{ total: number }>([
    { $match: orderMatchForStores(storeIds, period) },
    { $unwind: "$lineItems" },
    {
      $match: {
        "lineItems.variantId": { $exists: true, $nin: ["", null] },
        "lineItems.unitCost": { $lte: 0 },
      },
    },
    {
      $group: {
        _id: { storeId: "$storeId", variantId: "$lineItems.variantId" },
      },
    },
    { $count: "total" },
  ]);

  return rows[0]?.total ?? 0;
}

/** Variantes distintas sem custo, agrupadas por dia civil (fuso da loja opcional). */
export async function countMissingCogsByDay(
  storeIds: Types.ObjectId[],
  period: CogsPeriodSlice,
  storeTimeZone?: string | null,
): Promise<Map<string, number>> {
  if (!storeIds.length) return new Map();

  const match: Record<string, unknown> = {
    storeId: { $in: storeIds },
    ...(storeTimeZone
      ? orderDateMatchInTimezone(period, storeTimeZone)
      : orderDateMatch(period)),
  };

  const rows = await Order.aggregate<{ _id: string; count: number }>([
    { $match: match },
    { $unwind: "$lineItems" },
    {
      $match: {
        "lineItems.variantId": { $exists: true, $nin: ["", null] },
        "lineItems.unitCost": { $lte: 0 },
      },
    },
    {
      $group: {
        _id: {
          day: storeTimeZone
            ? {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$orderDate",
                  timezone: normalizeStoreTimezone(storeTimeZone),
                },
              }
            : {
                $dateToString: { format: "%Y-%m-%d", date: "$orderDate" },
              },
          variantId: "$lineItems.variantId",
        },
      },
    },
    {
      $group: {
        _id: "$_id.day",
        count: { $sum: 1 },
      },
    },
  ]);

  return new Map(rows.map((r) => [r._id, r.count]));
}

function pickCostAtDate(entries: HistoryEntry[], orderDate: Date): number | null {
  let best: HistoryEntry | null = null;
  for (const e of entries) {
    if (e.effectiveFrom > orderDate) continue;
    if (e.effectiveTo && orderDate >= e.effectiveTo) continue;
    if (!best || e.effectiveFrom > best.effectiveFrom) best = e;
  }
  return best?.cost ?? null;
}

export type { CostResolver } from "@/lib/line-snapshots";
export { applyLineUnitCost, applyLineUnitPrice } from "@/lib/line-snapshots";

type LineItemRow = {
  productId?: string | null;
  variantId?: string | null;
  title?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  unitCost?: number | null;
};

function normalizeLineItem(li: LineItemRow, unitCost: number) {
  return {
    productId: li.productId,
    variantId: li.variantId,
    title: li.title,
    quantity: num(li.quantity),
    unitPrice: num(li.unitPrice),
    unitCost,
  };
}

function sumOrderCogs(
  lineItems: Array<{ unitCost: number; quantity: number }>,
): number {
  return lineItems.reduce((sum, li) => sum + li.unitCost * li.quantity, 0);
}

/** Resolve o custo unitário válido numa data (manual > Shopify > cache legado). */
export function buildCostResolver(
  productCosts: Array<{
    variantId: string;
    unitCost?: number | null;
    manualCost?: number | null;
    manualCostFrom?: Date | null;
  }>,
  historyRows: Array<{
    variantId: string;
    source: string;
    cost: number;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
  }>,
): CostResolver {
  const legacy = new Map<
    string,
    { shopify: number; manual: number | null; manualFrom: Date | null }
  >(
    productCosts.map((c) => [
      String(c.variantId),
      {
        shopify: num(c.unitCost),
        manual: c.manualCost == null ? null : num(c.manualCost),
        manualFrom: c.manualCostFrom ? new Date(c.manualCostFrom) : null,
      },
    ]),
  );

  const manualHist = new Map<string, HistoryEntry[]>();
  const shopifyHist = new Map<string, HistoryEntry[]>();
  for (const h of historyRows) {
    const entry: HistoryEntry = {
      cost: num(h.cost),
      effectiveFrom: new Date(h.effectiveFrom),
      effectiveTo: h.effectiveTo ? new Date(h.effectiveTo) : null,
    };
    const map = h.source === "manual" ? manualHist : shopifyHist;
    const list = map.get(h.variantId) ?? [];
    list.push(entry);
    map.set(h.variantId, list);
  }

  return (variantId: string, orderDate: Date): number => {
    const manual = pickCostAtDate(manualHist.get(variantId) ?? [], orderDate);
    if (manual != null) return manual;

    const shopify = pickCostAtDate(shopifyHist.get(variantId) ?? [], orderDate);
    if (shopify != null) return shopify;

    const c = legacy.get(variantId);
    if (!c) return 0;
    if (c.manual != null && (!c.manualFrom || orderDate >= c.manualFrom)) {
      return c.manual;
    }
    return c.shopify;
  };
}

async function closeOpenHistory(
  storeId: Types.ObjectId,
  variantId: string,
  source: "shopify" | "manual",
  effectiveTo: Date,
) {
  await CogsHistory.updateMany(
    { storeId, variantId, source, effectiveTo: null },
    { $set: { effectiveTo } },
  );
}

/** Regista alteração de custo manual com data de vigência. */
export async function recordManualCostChange(
  storeId: Types.ObjectId,
  variantId: string,
  cost: number,
  effectiveFrom: Date,
  productId?: string | null,
) {
  await closeOpenHistory(storeId, variantId, "manual", effectiveFrom);
  await CogsHistory.create({
    storeId,
    variantId,
    productId: productId ?? undefined,
    cost,
    source: "manual",
    effectiveFrom,
    effectiveTo: null,
  });
}

/** Regista alteração de custo vinda da Shopify (ex.: desconto do fornecedor). */
export async function recordShopifyCostChange(
  storeId: Types.ObjectId,
  variantId: string,
  cost: number,
  effectiveFrom: Date,
  productId?: string | null,
) {
  await closeOpenHistory(storeId, variantId, "shopify", effectiveFrom);
  await CogsHistory.create({
    storeId,
    variantId,
    productId: productId ?? undefined,
    cost,
    source: "shopify",
    effectiveFrom,
    effectiveTo: null,
  });
}

async function closeOpenPriceHistory(
  storeId: Types.ObjectId,
  variantId: string,
  effectiveTo: Date,
) {
  await PriceHistory.updateMany(
    { storeId, variantId, effectiveTo: null },
    { $set: { effectiveTo } },
  );
}

/** Regista alteração de preço de venda vinda da Shopify. */
export async function recordShopifyPriceChange(
  storeId: Types.ObjectId,
  variantId: string,
  price: number,
  effectiveFrom: Date,
  productId?: string | null,
) {
  await closeOpenPriceHistory(storeId, variantId, effectiveFrom);
  await PriceHistory.create({
    storeId,
    variantId,
    productId: productId ?? undefined,
    price,
    source: "shopify",
    effectiveFrom,
    effectiveTo: null,
  });
}

/** Fecha entradas manuais abertas (remove override). */
export async function closeManualCostHistory(
  storeId: Types.ObjectId,
  variantId: string,
  effectiveTo: Date = new Date(),
) {
  await closeOpenHistory(storeId, variantId, "manual", effectiveTo);
}

/** Carrega resolver para uma loja (sync de encomendas). */
export async function loadCostResolverForStore(
  storeId: Types.ObjectId,
): Promise<CostResolver> {
  const [costs, history] = await Promise.all([
    ProductCost.find({ storeId })
      .select("variantId unitCost manualCost manualCostFrom")
      .lean(),
    CogsHistory.find({ storeId })
      .select("variantId source cost effectiveFrom effectiveTo")
      .lean(),
  ]);
  return buildCostResolver(costs, history);
}

export type AssimilateResult = {
  ordersUpdated: number;
  linesFilled: number;
};

export type AssimilateOptions = {
  /** Só rever variantes indicadas (ex. após mudança de custo na Shopify). */
  variantIds?: string[];
  /** Só encomendas a partir desta data (ex. custo manual com vigência futura). */
  from?: Date;
};

/** Soma resultados de várias passagens de assimilação na mesma sync. */
export function mergeAssimilateResults(
  ...results: AssimilateResult[]
): AssimilateResult {
  return results.reduce(
    (acc, r) => ({
      ordersUpdated: acc.ordersUpdated + r.ordersUpdated,
      linesFilled: acc.linesFilled + r.linesFilled,
    }),
    { ordersUpdated: 0, linesFilled: 0 },
  );
}

/**
 * Percorre encomendas com linhas sem custo e preenche quando já existe COGS
 * válido na data da venda. Reavalia em cada sync — inclui vendas novas.
 */
export async function assimilatePendingCogsForStore(
  storeId: Types.ObjectId,
  options?: AssimilateOptions,
): Promise<AssimilateResult> {
  const resolveCost = await loadCostResolverForStore(storeId);
  const result: AssimilateResult = { ordersUpdated: 0, linesFilled: 0 };

  let lastId: Types.ObjectId | null = null;
  const batchSize = 100;
  const variantIds = options?.variantIds?.filter(Boolean);

  while (true) {
    const elemMatch: Record<string, unknown> = {
      variantId: { $exists: true, $nin: ["", null] },
      unitCost: { $lte: 0 },
    };
    if (variantIds?.length) {
      elemMatch.variantId = { $in: variantIds };
    }

    const filter: Record<string, unknown> = {
      storeId,
      lineItems: { $elemMatch: elemMatch },
    };
    if (options?.from) {
      filter.orderDate = { $gte: options.from };
    }
    if (lastId) filter._id = { $gt: lastId };

    const orders = await Order.find(filter)
      .select("_id orderDate lineItems")
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (!orders.length) break;

    const bulkOps: AnyBulkWriteOperation[] = [];

    for (const order of orders) {
      lastId = order._id;
      const orderDate = new Date(order.orderDate);
      let changed = false;
      const lineItems = (order.lineItems ?? []).map((li) => {
        const variantId = String(li.variantId ?? "");
        const prev = num(li.unitCost);
        const unitCost = applyLineUnitCost(
          variantId,
          orderDate,
          prev,
          resolveCost,
        );
        if (unitCost > 0 && prev <= 0) {
          changed = true;
          result.linesFilled++;
        }
        return normalizeLineItem(li, unitCost);
      });

      if (!changed) continue;

      bulkOps.push({
        updateOne: {
          filter: { _id: order._id },
          update: { $set: { lineItems, cogs: sumOrderCogs(lineItems) } },
        },
      });
      result.ordersUpdated++;
    }

    if (bulkOps.length) {
      await Order.bulkWrite(bulkOps, { ordered: false });
    }

    if (orders.length < batchSize) break;
  }

  return result;
}

/**
 * Preenche linhas sem custo a partir de `from`, usando o custo correto
 * na data de cada encomenda (histórico + manual + Shopify).
 */
export async function backfillMissingLineCosts(
  storeId: Types.ObjectId,
  variantId: string,
  from: Date,
) {
  await assimilatePendingCogsForStore(storeId, { variantIds: [variantId], from });
}
