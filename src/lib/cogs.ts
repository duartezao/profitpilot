import "server-only";
import type { AnyBulkWriteOperation, PipelineStage } from "mongoose";
import type { Types } from "mongoose";
import { Order } from "@/models/Order";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
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
  pricesNearlyEqual,
  type CostResolver,
} from "@/lib/line-snapshots";
import { buildOrderAmountsBase } from "@/lib/order-money";

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
async function listSoldVariantsMissingCostFromOrders(
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

/** Exclui variantes com custo já conhecido no catálogo (Shopify/manual). */
async function excludeVariantsWithCatalogCost(
  storeIds: Types.ObjectId[],
  rows: SoldVariantMissingCost[],
): Promise<SoldVariantMissingCost[]> {
  if (!rows.length) return rows;

  const variantIds = [...new Set(rows.map((r) => r.variantId))];
  const catalog = await ProductCost.find({
    storeId: { $in: storeIds },
    variantId: { $in: variantIds },
  })
    .select("storeId variantId unitCost manualCost")
    .lean();

  const resolved = new Set(
    catalog
      .filter(
        (c) =>
          num(c.unitCost) > 0 ||
          (c.manualCost != null && num(c.manualCost) >= 0),
      )
      .map((c) => `${String(c.storeId)}:${String(c.variantId)}`),
  );

  return rows.filter((r) => !resolved.has(`${r.storeId}:${r.variantId}`));
}

/** Título do catálogo (produto + variante cor/tamanho) quando existir. */
async function enrichMissingCostTitles(
  storeIds: Types.ObjectId[],
  rows: SoldVariantMissingCost[],
): Promise<SoldVariantMissingCost[]> {
  if (!rows.length) return rows;

  const variantIds = [...new Set(rows.map((r) => r.variantId))];
  const catalog = await ProductCost.find({
    storeId: { $in: storeIds },
    variantId: { $in: variantIds },
  })
    .select("storeId variantId title")
    .lean();

  const titleByKey = new Map(
    catalog
      .filter((c) => c.title?.trim())
      .map((c) => [`${String(c.storeId)}:${String(c.variantId)}`, c.title!.trim()]),
  );

  return rows.map((r) => ({
    ...r,
    title: titleByKey.get(`${r.storeId}:${r.variantId}`) ?? r.title,
  }));
}

/**
 * Variantes vendidas sem COGS resolvível.
 * Assimila custos do catálogo nas encomendas e só lista as que ficam sem valor.
 */
export async function listSoldVariantsMissingCost(
  storeIds: Types.ObjectId[],
  options?: { assimilateFirst?: boolean },
): Promise<SoldVariantMissingCost[]> {
  if (!storeIds.length) return [];

  if (options?.assimilateFirst !== false) {
    for (const storeId of storeIds) {
      await assimilatePendingCogsForStore(storeId);
    }
  }

  const rows = await listSoldVariantsMissingCostFromOrders(storeIds);
  const missing = await excludeVariantsWithCatalogCost(storeIds, rows);
  return enrichMissingCostTitles(storeIds, missing);
}

/** Conta variantes distintas vendidas sem custo resolvível (opcionalmente só no período). */
export async function countSoldVariantsMissingCost(
  storeIds: Types.ObjectId[],
  period?: CogsPeriodSlice,
): Promise<number> {
  if (!storeIds.length) return 0;

  const rows = await Order.aggregate<{
    _id: { storeId: Types.ObjectId; variantId: string };
  }>([
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
  ]);

  const candidates: SoldVariantMissingCost[] = rows.map((r) => ({
    storeId: String(r._id.storeId),
    variantId: String(r._id.variantId),
    title: "",
    unitsSold: 0,
    orderCount: 0,
  }));

  const missing = await excludeVariantsWithCatalogCost(storeIds, candidates);
  return missing.length;
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

function pickCostAtDate(
  entries: HistoryEntry[],
  orderDate: Date,
  acceptZero = false,
): number | null {
  let best: HistoryEntry | null = null;
  for (const e of entries) {
    if (e.effectiveFrom > orderDate) continue;
    if (e.effectiveTo && orderDate >= e.effectiveTo) continue;
    if (!best || e.effectiveFrom > best.effectiveFrom) best = e;
  }
  if (!best) return null;
  if (acceptZero) return best.cost;
  return best.cost > 0 ? best.cost : null;
}

export type { CostResolver } from "@/lib/line-snapshots";
export { applyLineUnitCost, applyLineUnitPrice } from "@/lib/line-snapshots";

export type PriceResolver = (variantId: string, orderDate: Date) => number;

type PriceHistoryEntry = {
  price: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

function pickPriceAtDate(
  entries: PriceHistoryEntry[],
  orderDate: Date,
): number | null {
  let best: PriceHistoryEntry | null = null;
  for (const e of entries) {
    if (e.effectiveFrom > orderDate) continue;
    if (e.effectiveTo && orderDate >= e.effectiveTo) continue;
    if (!best || e.effectiveFrom > best.effectiveFrom) best = e;
  }
  return best?.price ?? null;
}

function buildVariantProductIndex(
  rows: Array<{ variantId: string; productId?: string | null }>,
): {
  variantToProduct: Map<string, string>;
  variantsByProduct: Map<string, string[]>;
} {
  const variantToProduct = new Map<string, string>();
  const variantsByProduct = new Map<string, string[]>();
  for (const row of rows) {
    const variantId = String(row.variantId);
    const productId = row.productId ? String(row.productId) : "";
    if (!productId) continue;
    variantToProduct.set(variantId, productId);
    const list = variantsByProduct.get(productId) ?? [];
    if (!list.includes(variantId)) list.push(variantId);
    variantsByProduct.set(productId, list);
  }
  return { variantToProduct, variantsByProduct };
}

function resolveWithProductSiblings(
  variantId: string,
  orderDate: Date,
  variantToProduct: Map<string, string>,
  variantsByProduct: Map<string, string[]>,
  resolveDirect: (id: string, date: Date) => number,
): number {
  const direct = resolveDirect(variantId, orderDate);
  if (direct > 0) return direct;
  const productId = variantToProduct.get(variantId);
  if (!productId) return 0;
  let best = 0;
  for (const siblingId of variantsByProduct.get(productId) ?? []) {
    if (siblingId === variantId) continue;
    const siblingValue = resolveDirect(siblingId, orderDate);
    if (siblingValue > best) best = siblingValue;
  }
  return best;
}

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
    productId?: string | null;
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

  const { variantToProduct, variantsByProduct } =
    buildVariantProductIndex(productCosts);

  const resolveDirect = (variantId: string, orderDate: Date): number => {
    const manual = pickCostAtDate(
      manualHist.get(variantId) ?? [],
      orderDate,
      true,
    );
    if (manual != null) return manual;

    const shopify = pickCostAtDate(shopifyHist.get(variantId) ?? [], orderDate);
    if (shopify != null) return shopify;

    const c = legacy.get(variantId);
    if (!c) return 0;
    if (c.manual != null && (!c.manualFrom || orderDate >= c.manualFrom)) {
      return c.manual;
    }
    return c.shopify > 0 ? c.shopify : 0;
  };

  return (variantId: string, orderDate: Date): number =>
    resolveWithProductSiblings(
      variantId,
      orderDate,
      variantToProduct,
      variantsByProduct,
      resolveDirect,
    );
}

/** Resolve o preço de venda válido numa data (histórico Shopify + cache + variante irmã). */
export function buildPriceResolver(
  productCosts: Array<{
    variantId: string;
    productId?: string | null;
    price?: number | null;
  }>,
  historyRows: Array<{
    variantId: string;
    price: number;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
  }>,
): PriceResolver {
  const legacy = new Map(
    productCosts.map((c) => [String(c.variantId), num(c.price)]),
  );
  const shopifyHist = new Map<string, PriceHistoryEntry[]>();
  for (const h of historyRows) {
    const entry: PriceHistoryEntry = {
      price: num(h.price),
      effectiveFrom: new Date(h.effectiveFrom),
      effectiveTo: h.effectiveTo ? new Date(h.effectiveTo) : null,
    };
    const list = shopifyHist.get(h.variantId) ?? [];
    list.push(entry);
    shopifyHist.set(h.variantId, list);
  }

  const { variantToProduct, variantsByProduct } =
    buildVariantProductIndex(productCosts);

  const resolveDirect = (variantId: string, orderDate: Date): number => {
    const fromHist = pickPriceAtDate(shopifyHist.get(variantId) ?? [], orderDate);
    if (fromHist != null) return fromHist;
    return legacy.get(variantId) ?? 0;
  };

  return (variantId: string, orderDate: Date): number =>
    resolveWithProductSiblings(
      variantId,
      orderDate,
      variantToProduct,
      variantsByProduct,
      resolveDirect,
    );
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

export const SOLD_VARIANT_BATCH = 50;

/**
 * Variantes vendidas sem custo resolvido no catálogo (novas ou com unitCost 0).
 */
export async function listVariantIdsNeedingCostSync(
  storeId: Types.ObjectId,
  limit = SOLD_VARIANT_BATCH,
): Promise<string[]> {
  const sold = await Order.aggregate<{ _id: string }>([
    { $match: { storeId } },
    { $unwind: "$lineItems" },
    {
      $match: {
        "lineItems.variantId": { $exists: true, $nin: ["", null] },
      },
    },
    { $group: { _id: "$lineItems.variantId" } },
  ]);
  const variantIds = sold.map((r) => String(r._id)).filter(Boolean);
  if (!variantIds.length) return [];

  const catalog = await ProductCost.find({
    storeId,
    variantId: { $in: variantIds },
  })
    .select("variantId unitCost manualCost")
    .lean();

  const resolved = new Set(
    catalog
      .filter((c) => c.manualCost != null || num(c.unitCost) > 0)
      .map((c) => String(c.variantId)),
  );

  return variantIds.filter((id) => !resolved.has(id)).slice(0, limit);
}

/** Total de variantes distintas nas encomendas da loja. */
export async function countDistinctSoldVariants(
  storeId: Types.ObjectId,
): Promise<number> {
  const rows = await Order.aggregate<{ total: number }>([
    { $match: { storeId } },
    { $unwind: "$lineItems" },
    {
      $match: {
        "lineItems.variantId": { $exists: true, $nin: ["", null] },
      },
    },
    { $group: { _id: "$lineItems.variantId" } },
    { $count: "total" },
  ]);
  return rows[0]?.total ?? 0;
}

/** Variantes vendidas (cor/tamanho) paginadas por índice — evita cursor em IDs Shopify. */
export async function listSoldVariantIdsByOffset(
  storeId: Types.ObjectId,
  skip = 0,
  limit = SOLD_VARIANT_BATCH,
): Promise<string[]> {
  const pipeline: PipelineStage[] = [
    { $match: { storeId } },
    { $unwind: "$lineItems" },
    {
      $match: {
        "lineItems.variantId": { $exists: true, $nin: ["", null] },
      },
    },
    { $group: { _id: "$lineItems.variantId" } },
    { $sort: { _id: 1 } },
    { $skip: skip },
    { $limit: limit },
  ];
  const rows = await Order.aggregate<{ _id: string }>(pipeline);
  return rows.map((r) => String(r._id)).filter(Boolean);
}

/** Carrega resolver para uma loja (sync de encomendas). */
export async function loadCostResolverForStore(
  storeId: Types.ObjectId,
): Promise<CostResolver> {
  const [costs, history] = await Promise.all([
    ProductCost.find({ storeId })
      .select("variantId productId unitCost manualCost manualCostFrom")
      .lean(),
    CogsHistory.find({ storeId })
      .select("variantId source cost effectiveFrom effectiveTo")
      .lean(),
  ]);
  return buildCostResolver(costs, history);
}

/** Carrega resolver de preço de venda para encomendas sem preço na API. */
export async function loadPriceResolverForStore(
  storeId: Types.ObjectId,
): Promise<PriceResolver> {
  const [costs, history] = await Promise.all([
    ProductCost.find({ storeId })
      .select("variantId productId price")
      .lean(),
    PriceHistory.find({ storeId })
      .select("variantId price effectiveFrom effectiveTo")
      .lean(),
  ]);
  return buildPriceResolver(costs, history);
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
  /** Rever linhas já preenchidas quando o custo histórico mudou (desconto fornecedor). */
  reviseHistory?: boolean;
};

/** Data desde quando um custo/preço passou a valer (ex.: `inventoryItem.updatedAt` na Shopify). */
export function resolveCatalogEffectiveFrom(
  sourceUpdatedAt: Date | string | null | undefined,
  fallback: Date = new Date(),
): Date {
  if (!sourceUpdatedAt) return fallback;
  const d = new Date(sourceUpdatedAt);
  if (!Number.isFinite(d.getTime())) return fallback;
  if (d.getTime() > Date.now()) return fallback;
  return d;
}

/** Menor `effectiveFrom` shopify das variantes alteradas — limite para rever encomendas. */
export async function earliestShopifyEffectiveFrom(
  storeId: Types.ObjectId,
  variantIds: string[],
  kind: "cost" | "price",
): Promise<Date | undefined> {
  if (!variantIds.length) return undefined;
  if (kind === "cost") {
    const row = await CogsHistory.findOne({
      storeId,
      variantId: { $in: variantIds },
      source: "shopify",
    })
      .sort({ effectiveFrom: 1 })
      .select("effectiveFrom")
      .lean();
    return row?.effectiveFrom ? new Date(row.effectiveFrom) : undefined;
  }
  const row = await PriceHistory.findOne({
    storeId,
    variantId: { $in: variantIds },
  })
    .sort({ effectiveFrom: 1 })
    .select("effectiveFrom")
    .lean();
  return row?.effectiveFrom ? new Date(row.effectiveFrom) : undefined;
}

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
 * Percorre encomendas e aplica COGS histórico na data da venda.
 * Preenche linhas vazias; com `reviseHistory` corrige após desconto fornecedor tardio.
 */
export async function assimilatePendingCogsForStore(
  storeId: Types.ObjectId,
  options?: AssimilateOptions,
): Promise<AssimilateResult> {
  const resolveCost = await loadCostResolverForStore(storeId);
  const result: AssimilateResult = { ordersUpdated: 0, linesFilled: 0 };

  const store = await Store.findById(storeId)
    .select("workspaceId currency ianaTimezone")
    .lean();
  if (!store) return result;

  const workspace = await Workspace.findById(store.workspaceId)
    .select("baseCurrency")
    .lean();
  const storeCurrency = (store.currency ?? "EUR").toUpperCase();
  const baseCurrency = (workspace?.baseCurrency ?? "EUR").toUpperCase();
  const tz = normalizeStoreTimezone(store.ianaTimezone);

  let lastId: Types.ObjectId | null = null;
  const batchSize = 100;
  const variantIds = options?.variantIds?.filter(Boolean);
  const revising = Boolean(options?.reviseHistory || variantIds?.length);

  while (true) {
    const elemMatch: Record<string, unknown> = {
      variantId: { $exists: true, $nin: ["", null] },
    };
    if (variantIds?.length) {
      elemMatch.variantId = { $in: variantIds };
    } else if (!revising) {
      elemMatch.unitCost = { $lte: 0 };
    }

    const filter: Record<string, unknown> = {
      storeId,
      manualCogs: null,
      lineItems: { $elemMatch: elemMatch },
    };
    if (options?.from) {
      filter.orderDate = { $gte: options.from };
    }
    if (lastId) filter._id = { $gt: lastId };

    const orders = await Order.find(filter)
      .select(
        "_id orderDate lineItems subtotal totalPrice refunded netRevenue shipping fees cogs currency manualCogs",
      )
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
        if (
          variantIds?.length &&
          !variantIds.includes(variantId)
        ) {
          return normalizeLineItem(li, num(li.unitCost));
        }
        const prev = num(li.unitCost);
        const unitCost = applyLineUnitCost(
          variantId,
          orderDate,
          prev,
          resolveCost,
        );
        if (unitCost > 0 && !pricesNearlyEqual(unitCost, prev)) {
          changed = true;
          if (prev <= 0) result.linesFilled++;
        }
        return normalizeLineItem(li, unitCost);
      });

      if (!changed) continue;

      const newCogs = sumOrderCogs(lineItems);
      const amountsBase = await buildOrderAmountsBase(
        {
          subtotal: order.subtotal,
          totalPrice: order.totalPrice,
          refunded: order.refunded,
          netRevenue: order.netRevenue,
          cogs: newCogs,
          shipping: order.shipping,
          fees: order.fees,
        },
        storeCurrency,
        baseCurrency,
        orderDate,
        tz,
      );

      bulkOps.push({
        updateOne: {
          filter: { _id: order._id },
          update: { $set: { lineItems, cogs: newCogs, amountsBase } },
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
 * Preenche `unitPrice` em linhas sem preço quando o catálogo (ou variante irmã)
 * já tem valor válido na data da venda.
 */
export async function assimilatePendingPricesForStore(
  storeId: Types.ObjectId,
  options?: AssimilateOptions,
): Promise<AssimilateResult> {
  const resolvePrice = await loadPriceResolverForStore(storeId);
  const result: AssimilateResult = { ordersUpdated: 0, linesFilled: 0 };

  const store = await Store.findById(storeId)
    .select("workspaceId currency ianaTimezone")
    .lean();
  if (!store) return result;

  const workspace = await Workspace.findById(store.workspaceId)
    .select("baseCurrency")
    .lean();
  const storeCurrency = (store.currency ?? "EUR").toUpperCase();
  const baseCurrency = (workspace?.baseCurrency ?? "EUR").toUpperCase();
  const tz = normalizeStoreTimezone(store.ianaTimezone);

  let lastId: Types.ObjectId | null = null;
  const batchSize = 100;
  const variantIds = options?.variantIds?.filter(Boolean);

  while (true) {
    const elemMatch: Record<string, unknown> = {
      variantId: { $exists: true, $nin: ["", null] },
      unitPrice: { $lte: 0 },
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
      .select(
        "_id orderDate lineItems subtotal totalPrice refunded netRevenue shipping fees cogs currency manualCogs",
      )
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
        const prev = num(li.unitPrice);
        const catalogPrice = variantId ? resolvePrice(variantId, orderDate) : 0;
        const unitPrice = applyLineUnitPrice(prev, catalogPrice);
        if (unitPrice > 0 && prev <= 0) {
          changed = true;
          result.linesFilled++;
        }
        return {
          ...normalizeLineItem(li, num(li.unitCost)),
          unitPrice,
        };
      });

      if (!changed) continue;

      const amountsBase = await buildOrderAmountsBase(
        {
          subtotal: order.subtotal,
          totalPrice: order.totalPrice,
          refunded: order.refunded,
          netRevenue: order.netRevenue,
          cogs: order.manualCogs != null ? num(order.manualCogs) : order.cogs,
          shipping: order.shipping,
          fees: order.fees,
        },
        storeCurrency,
        baseCurrency,
        orderDate,
        tz,
        order.manualCogs != null ? num(order.manualCogs) : null,
      );

      bulkOps.push({
        updateOne: {
          filter: { _id: order._id },
          update: { $set: { lineItems, amountsBase } },
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
