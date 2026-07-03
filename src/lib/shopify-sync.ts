import "server-only";
import type { AnyBulkWriteOperation } from "mongoose";
import { Types } from "mongoose";
import { orderNetRevenue } from "@/lib/order-revenue";
import { backfillOrderNetRevenueForStore } from "@/lib/order-backfill";
import {
  backfillOrderLinePricesForStore,
  ordersNeedLinePriceBackfill,
} from "@/lib/order-price-backfill";
import {
  dateKeyInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import { connectToDatabase } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { enhancePayoutsError } from "@/lib/shopify-scopes";
import {
  normalizeShopDomain,
  SHOPIFY_API_VERSION,
  getClientCredentialsToken,
  testShopifyConnection,
} from "@/lib/shopify";
import { Store, type StoreDoc } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { Order } from "@/models/Order";
import { ProductCost } from "@/models/ProductCost";
import {
  applyLineUnitCost,
  applyLineUnitPrice,
  assimilatePendingCogsForStore,
  listVariantIdsNeedingCostSync,
  loadCostResolverForStore,
  recordShopifyCostChange,
  recordShopifyPriceChange,
} from "@/lib/cogs";
import { syncSessionMetricsForStore } from "@/lib/session-metrics";
import { syncDisputes } from "@/lib/dispute-sync";
import { snapshotYesterdayMetrics, backfillDailyMetricsForStore } from "@/lib/daily-metrics-snapshot";
import { syncApiAdSpendForStore } from "@/lib/ad-spend-sync";
import { invalidateWorkspaceMetricsCache } from "@/lib/metrics-summary-cache";
import { Payout } from "@/models/Payout";
import { BalanceTransaction } from "@/models/BalanceTransaction";
import { buildOrderAmountsBase } from "@/lib/order-money";
import {
  assimilatesCogsOnSync,
  syncsShopifyProductCosts,
} from "@/lib/cogs-modes";
import { applyOrderFeesFromShopify } from "@/lib/order-fees-from-shopify";

/** Campos da loja atualizados durante o sync — persistidos com updateOne (sem __v). */
export type StoreSyncPersist = {
  scopes?: string[];
  ianaTimezone?: string | null;
  lastSyncAt?: Date;
  lastSyncError?: string | null;
  payoutsError?: string | null;
  paymentsBalance?: number;
  paymentsBalanceUpdatedAt?: Date;
  lastSessionMetricsError?: string | null;
};

export async function persistStoreSyncFields(
  storeId: string | Types.ObjectId,
  fields: StoreSyncPersist,
): Promise<void> {
  const $set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) $set[key] = value;
  }
  if (!Object.keys($set).length) return;
  await Store.updateOne({ _id: storeId }, { $set });
}

type GraphQLResult<T> = { data?: T; errors?: Array<{ message: string }> };

/** Lê e desencripta as credenciais guardadas da loja (client id/secret). */
function getStoreCredentials(store: StoreDoc): {
  clientId: string;
  clientSecret: string;
} {
  if (!store.credentials) {
    throw new Error("Loja sem credenciais guardadas.");
  }
  return JSON.parse(decrypt(store.credentials));
}

async function shopifyGraphQL<T>(
  domain: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Shopify respondeu ${res.status}.`);
  }

  const json = (await res.json()) as GraphQLResult<T>;
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  if (!json.data) {
    throw new Error("Resposta vazia da Shopify.");
  }
  return json.data;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function normPayoutStatus(s?: string | null) {
  return (s ?? "").toLowerCase();
}

/** @deprecated Importa o catálogo inteiro — usar syncSoldProductCostsPage / syncAllSoldProductCosts. */
export async function syncProductCosts(
  store: StoreDoc,
  domain: string,
  token: string,
): Promise<{ count: number; changedVariantIds: string[] }> {
  const query = `query($cursor: String) {
    productVariants(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        price
        product { id title }
        inventoryItem { unitCost { amount } }
      }
    }
  }`;

  type Resp = {
    productVariants: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        title: string;
        price: string;
        product: { id: string; title: string } | null;
        inventoryItem: { unitCost: { amount: string } | null } | null;
      }>;
    };
  };

  const existing = await ProductCost.find({ storeId: store._id })
    .select("variantId unitCost price")
    .lean();
  const prevCosts = new Map(
    existing.map((c) => [String(c.variantId), num(c.unitCost)]),
  );
  const prevPrices = new Map(
    existing.map((c) => [String(c.variantId), num(c.price)]),
  );

  let cursor: string | null = null;
  let count = 0;
  const changedVariantIds: string[] = [];
  // Limite de segurança para não correr indefinidamente.
  for (let page = 0; page < 100; page++) {
    const data: Resp = await shopifyGraphQL<Resp>(domain, token, query, {
      cursor,
    });
    const conn = data.productVariants;

    const ops = conn.nodes.map((v) => {
      const newCost = num(v.inventoryItem?.unitCost?.amount);
      const newPrice = num(v.price);
      return {
        updateOne: {
          filter: { storeId: store._id, variantId: v.id },
          update: {
            $set: {
              storeId: store._id,
              variantId: v.id,
              productId: v.product?.id,
              title: v.product?.title
                ? `${v.product.title}${v.title && v.title !== "Default Title" ? ` — ${v.title}` : ""}`
                : v.title,
              price: newPrice,
              unitCost: newCost,
              currency: store.currency,
            },
          },
          upsert: true,
        },
        newCost,
        newPrice,
        productId: v.product?.id,
      };
    });

    if (ops.length) {
      const effectiveFrom = new Date();
      await ProductCost.bulkWrite(
        ops.map(({ updateOne }) => ({ updateOne })),
        { ordered: false },
      );
      for (const op of ops) {
        const variantId = String(op.updateOne.filter.variantId);
        const prevCost = prevCosts.get(variantId);
        const costChanged = prevCost === undefined || prevCost !== op.newCost;
        if (costChanged) {
          await recordShopifyCostChange(
            store._id,
            variantId,
            op.newCost,
            prevCost === undefined ? new Date(0) : effectiveFrom,
            op.productId,
          );
          prevCosts.set(variantId, op.newCost);
          changedVariantIds.push(variantId);
        }

        const prevPrice = prevPrices.get(variantId);
        const priceChanged = prevPrice === undefined || prevPrice !== op.newPrice;
        if (priceChanged) {
          await recordShopifyPriceChange(
            store._id,
            variantId,
            op.newPrice,
            prevPrice === undefined ? new Date(0) : effectiveFrom,
            op.productId,
          );
          prevPrices.set(variantId, op.newPrice);
        }
      }
      count += ops.length;
    }

    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  if (changedVariantIds.length) {
    await assimilatePendingCogsForStore(store._id, {
      variantIds: changedVariantIds,
    });
  }

  return { count, changedVariantIds };
}

/** Uma página de variantes (sync em passos — evita timeout em serverless). */
export async function syncProductCostsPage(
  store: StoreDoc,
  domain: string,
  token: string,
  cursor: string | null,
): Promise<{
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
  changedVariantIds: string[];
}> {
  const query = `query($cursor: String) {
    productVariants(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        price
        product { id title }
        inventoryItem { unitCost { amount } }
      }
    }
  }`;

  type Resp = {
    productVariants: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        title: string;
        price: string;
        product: { id: string; title: string } | null;
        inventoryItem: { unitCost: { amount: string } | null } | null;
      }>;
    };
  };

  const existing = await ProductCost.find({ storeId: store._id })
    .select("variantId unitCost price")
    .lean();
  const prevCosts = new Map(
    existing.map((c) => [String(c.variantId), num(c.unitCost)]),
  );
  const prevPrices = new Map(
    existing.map((c) => [String(c.variantId), num(c.price)]),
  );

  const data: Resp = await shopifyGraphQL<Resp>(domain, token, query, {
    cursor,
  });
  const conn = data.productVariants;
  const changedVariantIds: string[] = [];

  const ops = conn.nodes.map((v) => {
    const newCost = num(v.inventoryItem?.unitCost?.amount);
    const newPrice = num(v.price);
    return {
      updateOne: {
        filter: { storeId: store._id, variantId: v.id },
        update: {
          $set: {
            storeId: store._id,
            variantId: v.id,
            productId: v.product?.id,
            title: v.product?.title
              ? `${v.product.title}${v.title && v.title !== "Default Title" ? ` — ${v.title}` : ""}`
              : v.title,
            price: newPrice,
            unitCost: newCost,
            currency: store.currency,
          },
        },
        upsert: true,
      },
      newCost,
      newPrice,
      productId: v.product?.id,
      variantId: v.id,
    };
  });

  if (ops.length) {
    const effectiveFrom = new Date();
    await ProductCost.bulkWrite(
      ops.map(({ updateOne }) => ({ updateOne })),
      { ordered: false },
    );
    for (const op of ops) {
      const variantId = String(op.variantId);
      const prevCost = prevCosts.get(variantId);
      const costChanged = prevCost === undefined || prevCost !== op.newCost;
      if (costChanged) {
        await recordShopifyCostChange(
          store._id,
          variantId,
          op.newCost,
          prevCost === undefined ? new Date(0) : effectiveFrom,
          op.productId,
        );
        changedVariantIds.push(variantId);
      }

      const prevPrice = prevPrices.get(variantId);
      const priceChanged = prevPrice === undefined || prevPrice !== op.newPrice;
      if (priceChanged) {
        await recordShopifyPriceChange(
          store._id,
          variantId,
          op.newPrice,
          prevPrice === undefined ? new Date(0) : effectiveFrom,
          op.productId,
        );
      }
    }
  }

  return {
    count: ops.length,
    hasMore: conn.pageInfo.hasNextPage,
    nextCursor: conn.pageInfo.endCursor,
    changedVariantIds,
  };
}

type ShopifyVariantCostNode = {
  id: string;
  title: string;
  price: string;
  product: { id: string; title: string } | null;
  inventoryItem: { unitCost: { amount: string } | null } | null;
};

/** Grava custos/preços de variantes na BD e regista histórico. */
async function upsertProductCostNodes(
  store: StoreDoc,
  nodes: ShopifyVariantCostNode[],
): Promise<{ count: number; changedVariantIds: string[] }> {
  if (!nodes.length) return { count: 0, changedVariantIds: [] };

  const existing = await ProductCost.find({ storeId: store._id })
    .select("variantId unitCost price")
    .lean();
  const prevCosts = new Map(
    existing.map((c) => [String(c.variantId), num(c.unitCost)]),
  );
  const prevPrices = new Map(
    existing.map((c) => [String(c.variantId), num(c.price)]),
  );

  const ops = nodes.map((v) => {
    const newCost = num(v.inventoryItem?.unitCost?.amount);
    const newPrice = num(v.price);
    return {
      updateOne: {
        filter: { storeId: store._id, variantId: v.id },
        update: {
          $set: {
            storeId: store._id,
            variantId: v.id,
            productId: v.product?.id,
            title: v.product?.title
              ? `${v.product.title}${v.title && v.title !== "Default Title" ? ` — ${v.title}` : ""}`
              : v.title,
            price: newPrice,
            unitCost: newCost,
            currency: store.currency,
          },
        },
        upsert: true,
      },
      newCost,
      newPrice,
      productId: v.product?.id,
      variantId: v.id,
    };
  });

  const changedVariantIds: string[] = [];
  const effectiveFrom = new Date();
  await ProductCost.bulkWrite(
    ops.map(({ updateOne }) => ({ updateOne })),
    { ordered: false },
  );

  for (const op of ops) {
    const variantId = String(op.variantId);
    const prevCost = prevCosts.get(variantId);
    const costChanged = prevCost === undefined || prevCost !== op.newCost;
    if (costChanged) {
      await recordShopifyCostChange(
        store._id,
        variantId,
        op.newCost,
        prevCost === undefined ? new Date(0) : effectiveFrom,
        op.productId,
      );
      changedVariantIds.push(variantId);
    }

    const prevPrice = prevPrices.get(variantId);
    const priceChanged = prevPrice === undefined || prevPrice !== op.newPrice;
    if (priceChanged) {
      await recordShopifyPriceChange(
        store._id,
        variantId,
        op.newPrice,
        prevPrice === undefined ? new Date(0) : effectiveFrom,
        op.productId,
      );
    }
  }

  return { count: ops.length, changedVariantIds };
}

/**
 * Importa custos Shopify só para variantes vendidas (sem custo na BD).
 * Um passo — para sync em chunks no Hobby.
 */
export async function syncSoldProductCostsPage(
  store: StoreDoc,
  domain: string,
  token: string,
): Promise<{ count: number; hasMore: boolean; changedVariantIds: string[] }> {
  const variantIds = await listVariantIdsNeedingCostSync(store._id);
  if (!variantIds.length) {
    return { count: 0, hasMore: false, changedVariantIds: [] };
  }

  const query = `query($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        title
        price
        product { id title }
        inventoryItem { unitCost { amount } }
      }
    }
  }`;

  type Resp = {
    nodes: Array<ShopifyVariantCostNode | null>;
  };

  const data = await shopifyGraphQL<Resp>(domain, token, query, {
    ids: variantIds,
  });
  const nodes = data.nodes.filter(
    (n): n is ShopifyVariantCostNode => n != null && Boolean(n.id),
  );
  const { count, changedVariantIds } = await upsertProductCostNodes(
    store,
    nodes,
  );

  const remaining = await listVariantIdsNeedingCostSync(store._id, 1);
  return { count, hasMore: remaining.length > 0, changedVariantIds };
}

/** Importa custos de todas as variantes vendidas em falta (cron / sync completa). */
export async function syncAllSoldProductCosts(
  store: StoreDoc,
  domain: string,
  token: string,
): Promise<{ count: number; changedVariantIds: string[] }> {
  let total = 0;
  const changedVariantIds: string[] = [];
  for (let step = 0; step < 200; step++) {
    const page = await syncSoldProductCostsPage(store, domain, token);
    total += page.count;
    changedVariantIds.push(...page.changedVariantIds);
    if (!page.hasMore) break;
  }
  return { count: total, changedVariantIds };
}

export type OrdersPageResult = {
  /** Total processadas nesta página */
  imported: number;
  /** Novas na BD */
  inserted: number;
  /** Já existiam — só actualizadas */
  updated: number;
  nextCursor: string | null;
  hasMore: boolean;
};

const SYNC_LOOKBACK_MS = 2 * 60 * 60 * 1000;

/** Sync subsequente (já houve sync completa antes). */
export function isIncrementalSync(
  store: Pick<StoreDoc, "lastSyncAt">,
): boolean {
  return Boolean(store.lastSyncAt);
}

/** Instantância desde quando importar/atualizar encomendas (com margem para refunds). */
export function orderSyncSince(
  store: Pick<StoreDoc, "lastSyncAt" | "importStartDate">,
): Date {
  if (store.lastSyncAt) {
    return new Date(
      new Date(store.lastSyncAt).getTime() - SYNC_LOOKBACK_MS,
    );
  }
  return (
    store.importStartDate ??
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  );
}

/** Query Shopify: incremental por `updated_at`; primeira sync por `created_at`. Exclui anuladas. */
export function orderSyncSearchQuery(
  store: Pick<StoreDoc, "lastSyncAt" | "importStartDate">,
): string {
  const since = orderSyncSince(store);
  const base = store.lastSyncAt
    ? `updated_at:>=${since.toISOString()}`
    : `created_at:>=${since.toISOString()}`;
  return `${base} -financial_status:voided`;
}

/** Uma página de encomendas (50) — taxas aplicadas depois via balance transactions. */
export async function syncOrdersPage(
  store: StoreDoc,
  domain: string,
  token: string,
  cursor: string | null,
  pageSize = 50,
): Promise<OrdersPageResult> {
  const resolveCost = await loadCostResolverForStore(store._id);
  const workspace = await Workspace.findById(store.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = workspace?.baseCurrency ?? "EUR";
  const storeCurrency = (store.currency ?? "EUR").toUpperCase();

  const tz = normalizeStoreTimezone(store.ianaTimezone);

  // Desde quando importar: incremental (updated_at) ou primeira sync (created_at).
  const searchQuery = orderSyncSearchQuery(store);

  const query = `query($cursor: String, $q: String, $first: Int!) {
    orders(first: $first, after: $cursor, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        displayFinancialStatus
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        subtotalPriceSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        totalRefundedSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        lineItems(first: 100) {
          nodes {
            quantity
            title
            variant { id }
            product { id }
            originalUnitPriceSet { shopMoney { amount } }
          }
        }
      }
    }
  }`;

  type Money = { shopMoney: { amount: string; currencyCode?: string } } | null;
  type OrderNode = {
    id: string;
    name: string;
    createdAt: string;
    displayFinancialStatus: string | null;
    currentTotalPriceSet: Money;
    subtotalPriceSet: Money;
    totalDiscountsSet: Money;
    totalRefundedSet: Money;
    totalShippingPriceSet: Money;
    totalTaxSet: Money;
    lineItems: {
      nodes: Array<{
        quantity: number;
        title: string;
        variant: { id: string } | null;
        product: { id: string } | null;
        originalUnitPriceSet: Money;
      }>;
    };
  };
  type Resp = {
    orders: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: OrderNode[];
    };
  };

  const data: Resp = await shopifyGraphQL<Resp>(domain, token, query, {
    cursor,
    q: searchQuery,
    first: pageSize,
  });
  const conn = data.orders;

    // Custos já registados nestas encomendas (snapshot imutável do passado).
    const ids = conn.nodes.map((o) => o.id);
    const existingOrders = await Order.find({
      storeId: store._id,
      shopifyId: { $in: ids },
    })
      .select(
        "shopifyId orderDate fees lineItems.variantId lineItems.unitCost manualCogs",
      )
      .lean();
    const existingMap = new Map<
      string,
      Map<string, { unitCost: number; unitPrice: number }>
    >();
    const existingFees = new Map<string, number>();
    const existingManualCogs = new Map<string, number | null>();
    for (const eo of existingOrders) {
      const m = new Map<string, { unitCost: number; unitPrice: number }>();
      for (const li of eo.lineItems ?? []) {
        m.set(String(li.variantId), {
          unitCost: num(li.unitCost),
          unitPrice: num(li.unitPrice),
        });
      }
      existingMap.set(String(eo.shopifyId), m);
      if (eo.fees != null) existingFees.set(String(eo.shopifyId), num(eo.fees));
      existingManualCogs.set(
        String(eo.shopifyId),
        eo.manualCogs != null ? num(eo.manualCogs) : null,
      );
    }

    const ops: AnyBulkWriteOperation[] = [];
    let inserted = 0;
    let updated = 0;

    for (const o of conn.nodes) {
      const finStatus = (o.displayFinancialStatus ?? "").toLowerCase();
      if (finStatus === "voided" || finStatus === "expired") continue;

      const orderDate = new Date(o.createdAt);
      const isNew = !existingMap.has(o.id);
      const prevLine = existingMap.get(o.id);
      const lineItems = o.lineItems.nodes.map((li) => {
        const variantId = li.variant?.id ?? "";
        const prev = prevLine?.get(variantId);
        const unitCost = applyLineUnitCost(
          variantId,
          orderDate,
          prev?.unitCost ?? 0,
          resolveCost,
        );
        const apiPrice = num(li.originalUnitPriceSet?.shopMoney.amount);
        const unitPrice = applyLineUnitPrice(prev?.unitPrice ?? 0, apiPrice);
        return {
          productId: li.product?.id,
          variantId,
          title: li.title,
          quantity: num(li.quantity),
          unitPrice,
          unitCost,
        };
      });

      const cogs = lineItems.reduce(
        (sum, li) => sum + li.unitCost * li.quantity,
        0,
      );
      const totalPrice = num(o.currentTotalPriceSet?.shopMoney.amount);
      const subtotal = num(o.subtotalPriceSet?.shopMoney.amount);
      const refunded = num(o.totalRefundedSet?.shopMoney.amount);
      const shipping = num(o.totalShippingPriceSet?.shopMoney.amount);
      const netRevenue = orderNetRevenue({ subtotal, totalPrice, refunded });
      const feesForBase = existingFees.get(o.id) ?? 0;

      const manualCogs = existingManualCogs.get(o.id) ?? null;
      const cogsForBase = manualCogs != null ? manualCogs : cogs;
      const amountsBase = await buildOrderAmountsBase(
        {
          subtotal,
          totalPrice,
          refunded,
          netRevenue,
          cogs: cogsForBase,
          shipping,
          fees: feesForBase,
        },
        storeCurrency,
        baseCurrency,
        orderDate,
        tz,
        manualCogs,
      );

      ops.push({
        updateOne: {
          filter: { storeId: store._id, shopifyId: o.id },
          update: {
            $set: {
              workspaceId: store.workspaceId,
              storeId: store._id,
              shopifyId: o.id,
              name: o.name,
              orderDate,
              currency:
                o.currentTotalPriceSet?.shopMoney.currencyCode ?? store.currency,
              financialStatus: o.displayFinancialStatus,
              totalPrice,
              subtotal,
              netRevenue,
              discounts: num(o.totalDiscountsSet?.shopMoney.amount),
              shipping,
              tax: num(o.totalTaxSet?.shopMoney.amount),
              refunded,
              cogs,
              lineItems,
              amountsBase,
            },
            $setOnInsert: { fees: 0, feesSource: null },
          },
          upsert: true,
        },
      });
      if (isNew) inserted += 1;
      else updated += 1;
    }

  const imported = inserted + updated;
  if (ops.length) {
    await Order.bulkWrite(ops as AnyBulkWriteOperation[], { ordered: false });
  }

  return {
    imported,
    inserted,
    updated,
    nextCursor: conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null,
    hasMore: conn.pageInfo.hasNextPage,
  };
}

/** Importa orders (COGS por linha; taxas na fase applyOrderFeesFromShopify). */
async function syncOrders(
  store: StoreDoc,
  domain: string,
  token: string,
): Promise<number> {
  let cursor: string | null = null;
  let count = 0;

  for (let page = 0; page < 200; page++) {
    const result = await syncOrdersPage(store, domain, token, cursor);
    count += result.imported;
    if (!result.hasMore) break;
    cursor = result.nextCursor;
  }

  await backfillOrderNetRevenueForStore(store._id);
  if (await ordersNeedLinePriceBackfill(store._id)) {
    await backfillOrderLinePricesForStore(store._id, domain, token);
  }

  return count;
}

/**
 * Importa payouts do Shopify Payments e o saldo atual (por pagar).
 * Tolerante a falhas: se a loja não usar Shopify Payments ou faltar o scope,
 * devolve 0 sem quebrar o resto da sincronização.
 */
export async function syncPayouts(
  store: StoreDoc,
  domain: string,
  token: string,
  opts?: { maxPages?: number },
): Promise<number> {
  const query = `query($cursor: String) {
    shopifyPaymentsAccount {
      balance { amount currencyCode }
      payouts(first: 50, after: $cursor, sortKey: ISSUED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          issuedAt
          status
          net { amount currencyCode }
          summary {
            chargesFee { amount }
            refundsFee { amount }
            adjustmentsFee { amount }
            chargesGross { amount }
          }
        }
      }
    }
  }`;

  type Money = { amount: string; currencyCode?: string };
  type Summary = {
    chargesFee: Money | null;
    refundsFee: Money | null;
    adjustmentsFee: Money | null;
    chargesGross: Money | null;
  } | null;
  type Resp = {
    shopifyPaymentsAccount: {
      balance: Money[];
      payouts: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          issuedAt: string | null;
          status: string | null;
          net: Money | null;
          summary: Summary;
        }>;
      };
    } | null;
  };

  let cursor: string | null = null;
  let count = 0;
  let balanceSaved = false;

  // Até N páginas por execução (2 em sync incremental, 6 na primeira sync).
  const maxPages = opts?.maxPages ?? 6;
  for (let page = 0; page < maxPages; page++) {
    const data: Resp = await shopifyGraphQL<Resp>(domain, token, query, {
      cursor,
    });

    // Loja sem Shopify Payments: não é erro, simplesmente não há conta.
    const account = data.shopifyPaymentsAccount;
    if (!account) break;

    if (!balanceSaved) {
      const balance = (account.balance ?? []).reduce(
        (sum, b) => sum + num(b.amount),
        0,
      );
      store.paymentsBalance = balance;
      store.paymentsBalanceUpdatedAt = new Date();
      balanceSaved = true;
    }

    const shopifyIds = account.payouts.nodes.map((p) => p.id);
    const existingRows = shopifyIds.length
      ? await Payout.find({
          storeId: store._id,
          shopifyId: { $in: shopifyIds },
        })
          .select("shopifyId paidAt status")
          .lean()
      : [];
    const existingByShopifyId = new Map(
      existingRows.map((row) => [row.shopifyId, row]),
    );

    const ops = account.payouts.nodes.map((p) => {
      const fee =
        num(p.summary?.chargesFee?.amount) +
        num(p.summary?.refundsFee?.amount) +
        num(p.summary?.adjustmentsFee?.amount);
      const prev = existingByShopifyId.get(p.id);
      const isPaid = normPayoutStatus(p.status) === "paid";
      let paidAt: Date | null = null;
      if (isPaid) {
        paidAt =
          prev?.paidAt ??
          (p.issuedAt ? new Date(p.issuedAt) : new Date());
      }

      return {
        updateOne: {
          filter: { storeId: store._id, shopifyId: p.id },
          update: {
            $set: {
              workspaceId: store.workspaceId,
              storeId: store._id,
              shopifyId: p.id,
              issuedAt: p.issuedAt ? new Date(p.issuedAt) : undefined,
              status: p.status,
              net: num(p.net?.amount),
              fee,
              gross: num(p.summary?.chargesGross?.amount),
              currency: p.net?.currencyCode ?? store.currency,
              paidAt,
            },
          },
          upsert: true,
        },
      };
    });

    if (ops.length) {
      await Payout.bulkWrite(ops as AnyBulkWriteOperation[], { ordered: false });
      count += ops.length;
    }

    if (!account.payouts.pageInfo.hasNextPage) break;
    cursor = account.payouts.pageInfo.endCursor;
  }

  return count;
}

const INCOMING_BT_STATUSES = new Set(["pending"]);

/**
 * Importa balance transactions ainda não pagas (pending, scheduled, in transit)
 * para agregar "a caminho" por dia na tesouraria.
 */
export async function syncIncomingBalanceTransactions(
  store: StoreDoc,
  domain: string,
  token: string,
): Promise<number> {
  const query = `query($cursor: String) {
    shopifyPaymentsAccount {
      balanceTransactions(first: 50, after: $cursor, query: "payout_status:pending") {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          transactionDate
          type
          net { amount currencyCode }
          fee { amount }
          associatedPayout { id status }
        }
      }
    }
  }`;

  type Resp = {
    shopifyPaymentsAccount: {
      balanceTransactions: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          transactionDate: string;
          type: string | null;
          net: { amount: string; currencyCode?: string } | null;
          fee: { amount: string } | null;
          associatedPayout: { id: string; status: string | null } | null;
        }>;
      };
    } | null;
  };

  let cursor: string | null = null;
  let count = 0;
  const incoming: Array<{
    shopifyId: string;
    transactionDate: Date;
    payoutStatus: string;
    payoutShopifyId?: string;
    net: number;
    fee: number;
    type?: string;
    currency: string;
  }> = [];

  for (let page = 0; page < 15; page++) {
    const data: Resp = await shopifyGraphQL<Resp>(domain, token, query, {
      cursor,
    });
    const account = data.shopifyPaymentsAccount;
    if (!account) break;

    for (const bt of account.balanceTransactions.nodes) {
      const payoutStatus = (bt.associatedPayout?.status ?? "").toLowerCase();
      if (!INCOMING_BT_STATUSES.has(payoutStatus)) continue;

      incoming.push({
        shopifyId: bt.id,
        transactionDate: new Date(bt.transactionDate),
        payoutStatus,
        payoutShopifyId: bt.associatedPayout?.id,
        net: num(bt.net?.amount),
        fee: num(bt.fee?.amount),
        type: bt.type ?? undefined,
        currency: bt.net?.currencyCode ?? store.currency ?? "EUR",
      });
    }

    if (!account.balanceTransactions.pageInfo.hasNextPage) break;
    cursor = account.balanceTransactions.pageInfo.endCursor;
  }

  await BalanceTransaction.deleteMany({ storeId: store._id });

  if (incoming.length > 0) {
    const ops = incoming.map((bt) => ({
      updateOne: {
        filter: { storeId: store._id, shopifyId: bt.shopifyId },
        update: {
          $set: {
            workspaceId: store.workspaceId,
            storeId: store._id,
            shopifyId: bt.shopifyId,
            transactionDate: bt.transactionDate,
            payoutStatus: bt.payoutStatus,
            payoutShopifyId: bt.payoutShopifyId,
            net: bt.net,
            fee: bt.fee,
            type: bt.type,
            currency: bt.currency,
          },
        },
        upsert: true,
      },
    }));
    await BalanceTransaction.bulkWrite(ops as AnyBulkWriteOperation[], {
      ordered: false,
    });
    count = incoming.length;
  }

  return count;
}

export type SyncResult = {
  products: number;
  orders: number;
  payouts: number;
  balanceTransactions: number;
  cogsOrdersUpdated: number;
  cogsLinesFilled: number;
  sessionMetricsDays: number;
  orderFeesReal: number;
  orderFeesEstimated: number;
  disputes: number;
  payoutsError?: string;
  sessionMetricsError?: string;
};

/** Token Shopify fresco + domínio normalizado para uma loja. */
export async function prepareShopifySyncContext(storeId: string): Promise<{
  store: StoreDoc;
  domain: string;
  accessToken: string;
}> {
  await connectToDatabase();
  const store = await Store.findById(storeId).lean();
  if (!store) throw new Error("Loja não encontrada.");
  if (store.platform !== "shopify") {
    throw new Error("Só lojas Shopify são suportadas de momento.");
  }

  const creds = getStoreCredentials(store);
  const domain = normalizeShopDomain(store.shopDomain ?? "");

  const { accessToken, scope: tokenScope } = await getClientCredentialsToken(
    domain,
    creds.clientId,
    creds.clientSecret,
  );
  const scopes = tokenScope
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let ianaTimezone = store.ianaTimezone ?? undefined;
  // Override manual do utilizador tem prioridade — não sobrescrever com o da Shopify.
  if (store.timezoneSource !== "manual") {
    try {
      const shop = await testShopifyConnection(domain, accessToken);
      if (shop.ianaTimezone) {
        ianaTimezone = shop.ianaTimezone;
      }
    } catch {
      /* sync continua se o ping da shop falhar */
    }
  }

  await persistStoreSyncFields(store._id, {
    scopes,
    ...(ianaTimezone ? { ianaTimezone } : {}),
  });

  return {
    store: { ...store, scopes, ...(ianaTimezone ? { ianaTimezone } : {}) },
    domain,
    accessToken,
  };
}

/** Sincroniza uma loja: custos de produtos + orders. */
export async function syncStore(storeId: string): Promise<SyncResult> {
  const { store, domain, accessToken } = await prepareShopifySyncContext(storeId);
  const incremental = isIncrementalSync(store);
  const feeSince = store.lastSyncAt ? orderSyncSince(store) : null;

  let products = 0;
  const assimilateCogs = assimilatesCogsOnSync(store.cogsMode);
  const orders = await syncOrders(store, domain, accessToken);

  let changedVariantIds: string[] = [];
  if (syncsShopifyProductCosts(store.cogsMode)) {
    const sold = await syncAllSoldProductCosts(store, domain, accessToken);
    products = sold.count;
    changedVariantIds = sold.changedVariantIds;
  }

  const assimilated = assimilateCogs
    ? await assimilatePendingCogsForStore(
        store._id,
        changedVariantIds.length ? { variantIds: changedVariantIds } : undefined,
      )
    : { ordersUpdated: 0, linesFilled: 0 };

  let orderFeesReal = 0;
  let orderFeesEstimated = 0;
  try {
    const fees = await applyOrderFeesFromShopify(store, domain, accessToken, {
      since: feeSince,
    });
    orderFeesReal = fees.real;
    orderFeesEstimated = fees.estimated;
  } catch (e) {
    console.error("[sync] order fees", e);
  }

  // Payouts são opcionais: um erro aqui (ex.: scope em falta) não deve
  // impedir a sync de orders/produtos. Registamos o erro na loja.
  let payouts = 0;
  let balanceTransactions = 0;
  let disputes = 0;
  let payoutsError: string | undefined;
  try {
    payouts = await syncPayouts(store, domain, accessToken, {
      maxPages: incremental ? 2 : 6,
    });
    balanceTransactions = await syncIncomingBalanceTransactions(
      store,
      domain,
      accessToken,
    );
    try {
      disputes = await syncDisputes(store, domain, accessToken);
    } catch (e) {
      console.error("[sync] disputes", e);
    }
    store.payoutsError = null;
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Falha a obter payouts.";
    payoutsError = enhancePayoutsError(raw);
    store.payoutsError = payoutsError;
  }

  let sessionMetricsDays = 0;
  let sessionMetricsError: string | undefined;
  try {
    const sm = await syncSessionMetricsForStore(storeId);
    sessionMetricsDays = sm.synced;
    store.lastSessionMetricsError = null;
  } catch (e) {
    sessionMetricsError =
      e instanceof Error ? e.message : "Falha a obter sessões Shopify.";
    store.lastSessionMetricsError = sessionMetricsError;
  }

  try {
    await snapshotYesterdayMetrics(String(store.workspaceId), storeId);
    await backfillDailyMetricsForStore(storeId, {
      maxDays: incremental ? 3 : 30,
    });
  } catch (e) {
    console.error("[sync] daily metrics snapshot", e);
  }

  try {
    await syncApiAdSpendForStore(storeId);
  } catch (e) {
    console.error("[sync] ad spend api", e);
  }

  await persistStoreSyncFields(store._id, {
    lastSyncAt: new Date(),
    lastSyncError: null,
    payoutsError: store.payoutsError ?? null,
    lastSessionMetricsError: store.lastSessionMetricsError ?? null,
    ...(store.paymentsBalanceUpdatedAt
      ? {
          paymentsBalance: store.paymentsBalance,
          paymentsBalanceUpdatedAt: store.paymentsBalanceUpdatedAt,
        }
      : {}),
  });

  invalidateWorkspaceMetricsCache(String(store.workspaceId));

  return {
    products,
    orders,
    payouts,
    balanceTransactions,
    cogsOrdersUpdated: assimilated.ordersUpdated,
    cogsLinesFilled: assimilated.linesFilled,
    sessionMetricsDays,
    orderFeesReal,
    orderFeesEstimated,
    disputes,
    payoutsError,
    sessionMetricsError,
  };
}
