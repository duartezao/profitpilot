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
  assimilatePendingPricesForStore,
  earliestShopifyEffectiveFrom,
  countDistinctSoldVariants,
  listSoldVariantIdsByOffset,
  filterVariantIdsNeedingCostSync,
  listVariantIdsNeedingCostSync,
  SOLD_VARIANT_BATCH,
  loadCostResolverForStore,
  loadPriceResolverForStore,
  recordShopifyCostChange,
  recordShopifyPriceChange,
  resolveCatalogEffectiveFrom,
} from "@/lib/cogs";
import {
  buildCatalogFallbackContext,
  resolveVariantCatalogCost,
  resolveVariantCatalogPrice,
  type CatalogVariantInput,
} from "@/lib/catalog-fallback";
import {
  upsertProductCatalogEntries,
  type ShopifyCollectionRef,
} from "@/lib/product-catalog";
import { syncSessionMetricsForStore } from "@/lib/session-metrics";
import { syncDisputes } from "@/lib/dispute-sync";
import {
  normalizeOrderFinancialStatus,
  orderShouldBeRemoved,
} from "@/lib/order-financial-status";
import { snapshotYesterdayMetrics, reconcileDailyMetricsForStore } from "@/lib/daily-metrics-snapshot";
import { invalidateWorkspaceMetricsCache } from "@/lib/metrics-summary-cache";
import { Payout } from "@/models/Payout";
import { BalanceTransaction } from "@/models/BalanceTransaction";
import { buildOrderAmountsBase } from "@/lib/order-money";
import {
  assimilatesCogsOnSync,
  syncsShopifyProductCosts,
} from "@/lib/cogs-modes";
import { normalizeShippingCountryCode } from "@/lib/eu-customs-countries";
import { purgeLegacyManualEuFeesForStore } from "@/lib/eu-category-fees";
import { EU_CUSTOMS_FEE_EFFECTIVE_FROM } from "@/lib/eu-category-fees-types";
import { mergePaidOrderFilter } from "@/lib/order-financial-status";
import { parseDateInput, startOfDay } from "@/lib/period";
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

type ShopifyVariantCostNode = CatalogVariantInput & {
  title: string;
  updatedAt?: string;
  product: {
    id: string;
    title: string;
    collections?: {
      nodes: ShopifyCollectionRef[];
    } | null;
    priceRangeV2?: {
      minVariantPrice?: { amount?: string | null } | null;
    } | null;
    variants?: {
      nodes: Array<{
        id: string;
        price: string;
        updatedAt?: string;
        inventoryItem?: {
          updatedAt?: string;
          unitCost?: { amount?: string | null } | null;
        } | null;
      }>;
    } | null;
  } | null;
  inventoryItem?: {
    updatedAt?: string;
    unitCost?: { amount?: string | null } | null;
  } | null;
};

const SHOPIFY_VARIANT_CATALOG_FIELDS = `
  id
  title
  price
  updatedAt
  product {
    id
    title
    collections(first: 25) {
      nodes {
        id
        title
        handle
      }
    }
    priceRangeV2 { minVariantPrice { amount } }
    variants(first: 100) {
      nodes {
        id
        price
        updatedAt
        inventoryItem { updatedAt unitCost { amount } }
      }
    }
  }
  inventoryItem { updatedAt unitCost { amount } }
`;

/** Grava custos/preços de variantes na BD e regista histórico. */
async function upsertProductCostNodes(
  store: StoreDoc,
  nodes: ShopifyVariantCostNode[],
  options?: { deferAssimilate?: boolean },
): Promise<{
  count: number;
  changedVariantIds: string[];
  changedPriceVariantIds: string[];
}> {
  if (!nodes.length) {
    return { count: 0, changedVariantIds: [], changedPriceVariantIds: [] };
  }

  const batchIds = nodes.map((n) => n.id);
  const existing = await ProductCost.find({
    storeId: store._id,
    variantId: { $in: batchIds },
  })
    .select("variantId productId unitCost price")
    .lean();
  const prevCosts = new Map(
    existing.map((c) => [String(c.variantId), num(c.unitCost)]),
  );
  const prevPrices = new Map(
    existing.map((c) => [String(c.variantId), num(c.price)]),
  );
  const fallbackCtx = buildCatalogFallbackContext(nodes, existing);

  const ops = nodes.map((v) => {
    const productId = v.product?.id ?? null;
    const rawCost = num(v.inventoryItem?.unitCost?.amount);
    const rawPrice = num(v.price);
    const newCost = resolveVariantCatalogCost(
      v.id,
      productId,
      rawCost,
      fallbackCtx,
    );
    const newPrice = resolveVariantCatalogPrice(
      v.id,
      productId,
      rawPrice,
      fallbackCtx,
    );
    return {
      updateOne: {
        filter: { storeId: store._id, variantId: v.id },
        update: {
          $set: {
            storeId: store._id,
            variantId: v.id,
            productId: productId ?? undefined,
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
      productId,
      variantId: v.id,
      costEffectiveFrom: resolveCatalogEffectiveFrom(
        v.inventoryItem?.updatedAt ?? v.updatedAt,
      ),
      priceEffectiveFrom: resolveCatalogEffectiveFrom(
        v.updatedAt ?? v.inventoryItem?.updatedAt,
      ),
    };
  });

  const changedVariantIds: string[] = [];
  const changedPriceVariantIds: string[] = [];
  const costEffectiveFromByVariant = new Map<string, Date>();
  const priceEffectiveFromByVariant = new Map<string, Date>();
  await ProductCost.bulkWrite(
    ops.map(({ updateOne }) => ({ updateOne })),
    { ordered: false },
  );

  const catalogByProduct = new Map<
    string,
    { productId: string; title: string; collections: ShopifyCollectionRef[] }
  >();
  for (const node of nodes) {
    const productId = node.product?.id;
    if (!productId) continue;
    catalogByProduct.set(productId, {
      productId,
      title: node.product?.title ?? "",
      collections: node.product?.collections?.nodes ?? [],
    });
  }
  if (catalogByProduct.size > 0) {
    await upsertProductCatalogEntries(store._id, [...catalogByProduct.values()]);
  }

  for (const op of ops) {
    const variantId = String(op.variantId);
    const prevCost = prevCosts.get(variantId);
    const costChanged = prevCost === undefined || prevCost !== op.newCost;
    if (costChanged) {
      if (op.newCost > 0) {
        const effectiveFrom =
          prevCost === undefined ? new Date(0) : op.costEffectiveFrom;
        costEffectiveFromByVariant.set(variantId, effectiveFrom);
        await recordShopifyCostChange(
          store._id,
          variantId,
          op.newCost,
          effectiveFrom,
          op.productId,
        );
      }
      changedVariantIds.push(variantId);
    }

    const prevPrice = prevPrices.get(variantId);
    const priceChanged = prevPrice === undefined || prevPrice !== op.newPrice;
    if (priceChanged) {
      const effectiveFrom =
        prevPrice === undefined ? new Date(0) : op.priceEffectiveFrom;
      priceEffectiveFromByVariant.set(variantId, effectiveFrom);
      await recordShopifyPriceChange(
        store._id,
        variantId,
        op.newPrice,
        effectiveFrom,
        op.productId,
      );
      changedPriceVariantIds.push(variantId);
    }
  }

  if (!options?.deferAssimilate) {
    if (changedVariantIds.length) {
      const fromDates = [...costEffectiveFromByVariant.values()];
      const from =
        fromDates.length > 0
          ? new Date(Math.min(...fromDates.map((d) => d.getTime())))
          : await earliestShopifyEffectiveFrom(store._id, changedVariantIds, "cost");
      await assimilatePendingCogsForStore(store._id, {
        variantIds: changedVariantIds,
        from,
        reviseHistory: true,
      });
    }
    if (changedPriceVariantIds.length) {
      await assimilatePendingPricesForStore(store._id, {
        variantIds: changedPriceVariantIds,
      });
    }
  }

  return {
    count: ops.length,
    changedVariantIds,
    changedPriceVariantIds,
  };
}

export type SoldCostSyncOptions = {
  refreshOffset?: number;
  incremental?: boolean;
  /** Sync em passos (UI) — assimila COGS/preços só no fim da fase products. */
  deferAssimilate?: boolean;
  /** Lote menor no sync chunked (evita timeout Vercel). */
  batchSize?: number;
  /** Sync incremental UI — só variantes destas encomendas novas (deduplicadas). */
  restrictVariantIds?: string[];
  restrictOffset?: number;
};

/**
 * Importa/atualiza custos Shopify das variantes vendidas (cor/tamanho).
 * Incremental: só novas + 1 lote de revisão. Inicial: percorre todas em lotes.
 */
export async function syncSoldProductCostsPage(
  store: StoreDoc,
  domain: string,
  token: string,
  options: SoldCostSyncOptions = {},
): Promise<{
  count: number;
  hasMore: boolean;
  changedVariantIds: string[];
  nextRefreshOffset: number;
  mode: "new" | "refresh" | "none";
  pendingTotal?: number;
  pendingDone?: number;
}> {
  const refreshOffset = options.refreshOffset ?? 0;
  const incremental = options.incremental ?? false;
  const batchSize = options.batchSize ?? SOLD_VARIANT_BATCH;
  const restrictIds = options.restrictVariantIds;

  if (restrictIds?.length) {
    const offset = options.restrictOffset ?? 0;
    const filtered = await filterVariantIdsNeedingCostSync(
      store._id,
      restrictIds,
      batchSize,
      offset,
    );
    if (!filtered.ids.length) {
      return {
        count: 0,
        hasMore: false,
        changedVariantIds: [],
        nextRefreshOffset: offset,
        mode: "none",
        pendingTotal: filtered.total,
        pendingDone: offset,
      };
    }

    const query = `query($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        ${SHOPIFY_VARIANT_CATALOG_FIELDS}
      }
    }
  }`;

    type Resp = {
      nodes: Array<ShopifyVariantCostNode | null>;
    };

    const data = await shopifyGraphQL<Resp>(domain, token, query, {
      ids: filtered.ids,
    });
    const nodes = data.nodes.filter(
      (n): n is ShopifyVariantCostNode => n != null && Boolean(n.id),
    );
    const { count, changedVariantIds } = await upsertProductCostNodes(
      store,
      nodes,
      { deferAssimilate: options.deferAssimilate },
    );
    const nextOffset = offset + filtered.ids.length;
    return {
      count,
      hasMore: nextOffset < filtered.total,
      changedVariantIds,
      nextRefreshOffset: nextOffset,
      mode: "new",
      pendingTotal: filtered.total,
      pendingDone: nextOffset,
    };
  }

  const newIds = await listVariantIdsNeedingCostSync(store._id, batchSize);
  let variantIds: string[];
  let mode: "new" | "refresh" = "new";
  let nextRefreshOffset = refreshOffset;

  if (newIds.length) {
    variantIds = newIds;
  } else if (incremental) {
    return {
      count: 0,
      hasMore: false,
      changedVariantIds: [],
      nextRefreshOffset: refreshOffset,
      mode: "none",
    };
  } else {
    variantIds = await listSoldVariantIdsByOffset(
      store._id,
      refreshOffset,
      batchSize,
    );
    mode = "refresh";
    if (!variantIds.length) {
      return {
        count: 0,
        hasMore: false,
        changedVariantIds: [],
        nextRefreshOffset: refreshOffset,
        mode: "none",
      };
    }
    nextRefreshOffset = refreshOffset + variantIds.length;
  }

  const query = `query($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        ${SHOPIFY_VARIANT_CATALOG_FIELDS}
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
    { deferAssimilate: options.deferAssimilate },
  );

  if (mode === "new") {
    const stillNew = await listVariantIdsNeedingCostSync(store._id, 1);
    if (stillNew.length > 0) {
      return {
        count,
        hasMore: true,
        changedVariantIds,
        nextRefreshOffset: refreshOffset,
        mode: "new",
      };
    }
    if (!incremental) {
      const soldTotal = await countDistinctSoldVariants(store._id);
      if (soldTotal > 0) {
        return {
          count,
          hasMore: true,
          changedVariantIds,
          nextRefreshOffset: 0,
          mode: "new",
        };
      }
    }
    return {
      count,
      hasMore: false,
      changedVariantIds,
      nextRefreshOffset: refreshOffset,
      mode: "new",
    };
  }

  if (incremental) {
    return {
      count,
      hasMore: false,
      changedVariantIds,
      nextRefreshOffset: refreshOffset,
      mode: "refresh",
    };
  }

  const soldTotal = await countDistinctSoldVariants(store._id);
  return {
    count,
    hasMore: nextRefreshOffset < soldTotal,
    changedVariantIds,
    nextRefreshOffset,
    mode: "refresh",
  };
}

const SHOPIFY_PRODUCT_CATALOG_FIELDS = `
  id
  product {
    id
    title
    collections(first: 25) {
      nodes {
        id
        title
        handle
      }
    }
  }
`;

/** Sincroniza coleções Shopify dos produtos vendidos (independente do modo COGS). */
async function fetchAndUpsertProductCatalogNodes(
  store: StoreDoc,
  domain: string,
  token: string,
  variantIds: string[],
): Promise<number> {
  if (!variantIds.length) return 0;

  const query = `query($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        ${SHOPIFY_PRODUCT_CATALOG_FIELDS}
      }
    }
  }`;

  type CatalogNode = {
    id: string;
    product?: {
      id: string;
      title: string;
      collections?: { nodes: ShopifyCollectionRef[] } | null;
    } | null;
  };

  const data = await shopifyGraphQL<{ nodes: Array<CatalogNode | null> }>(
    domain,
    token,
    query,
    { ids: variantIds },
  );

  const catalogByProduct = new Map<
    string,
    { productId: string; title: string; collections: ShopifyCollectionRef[] }
  >();
  for (const node of data.nodes) {
    if (!node?.product?.id) continue;
    catalogByProduct.set(node.product.id, {
      productId: node.product.id,
      title: node.product.title ?? "",
      collections: node.product.collections?.nodes ?? [],
    });
  }

  return upsertProductCatalogEntries(store._id, [...catalogByProduct.values()]);
}

/** Coleções só das variantes indicadas (sync incremental — encomendas novas). */
export async function syncProductCatalogForVariantIds(
  store: StoreDoc,
  domain: string,
  token: string,
  variantIds: string[],
): Promise<number> {
  const unique = [...new Set(variantIds.filter(Boolean))];
  if (!unique.length) return 0;

  let total = 0;
  for (let i = 0; i < unique.length; i += SOLD_VARIANT_BATCH) {
    total += await fetchAndUpsertProductCatalogNodes(
      store,
      domain,
      token,
      unique.slice(i, i + SOLD_VARIANT_BATCH),
    );
  }
  return total;
}

export async function syncProductCatalogPage(
  store: StoreDoc,
  domain: string,
  token: string,
  options: { offset?: number; batchSize?: number } = {},
): Promise<{ count: number; hasMore: boolean; nextOffset: number }> {
  const offset = options.offset ?? 0;
  const batchSize = options.batchSize ?? SOLD_VARIANT_BATCH;
  const variantIds = await listSoldVariantIdsByOffset(
    store._id,
    offset,
    batchSize,
  );
  const soldTotal = await countDistinctSoldVariants(store._id);
  if (!variantIds.length) {
    return { count: 0, hasMore: false, nextOffset: offset };
  }

  const count = await fetchAndUpsertProductCatalogNodes(
    store,
    domain,
    token,
    variantIds,
  );
  const nextOffset = offset + variantIds.length;
  return {
    count,
    hasMore: nextOffset < soldTotal,
    nextOffset,
  };
}

/** Importa coleções de todas as variantes vendidas (cron / sync completa). */
export async function syncAllSoldProductCatalog(
  store: StoreDoc,
  domain: string,
  token: string,
): Promise<{ count: number }> {
  let total = 0;
  let offset = 0;
  for (let step = 0; step < 200; step++) {
    const page = await syncProductCatalogPage(store, domain, token, { offset });
    total += page.count;
    if (!page.hasMore) break;
    offset = page.nextOffset;
  }
  return { count: total };
}

/** Importa custos de todas as variantes vendidas em falta (cron / sync completa). */
export async function syncAllSoldProductCosts(
  store: StoreDoc,
  domain: string,
  token: string,
): Promise<{ count: number; changedVariantIds: string[] }> {
  let total = 0;
  const changedVariantIds: string[] = [];
  let refreshOffset = 0;
  for (let step = 0; step < 200; step++) {
    const page = await syncSoldProductCostsPage(store, domain, token, {
      refreshOffset,
      incremental: false,
    });
    total += page.count;
    changedVariantIds.push(...page.changedVariantIds);
    if (!page.hasMore) break;
    refreshOffset = page.nextRefreshOffset;
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
  /** Variantes distintas só das encomendas novas desta página */
  newOrderVariantIds: string[];
  nextCursor: string | null;
  hasMore: boolean;
};

import {
  isIncrementalOrderSync,
  orderImportFloorDate,
  orderSyncSearchQuery,
  orderSyncSince,
} from "@/lib/order-sync-query";

export {
  isIncrementalOrderSync as isIncrementalSync,
  orderImportFloorDate,
  orderSyncSearchQuery,
  orderSyncSince,
};

type OrderLineSnapshot = {
  productId?: string;
  variantId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

type OrderAmountsBaseSnapshot = {
  netRevenue: number | null;
  cogs: number | null;
  shipping: number | null;
  fees: number | null;
  refunded: number | null;
  fxRate: number | null;
  baseCurrency: string | null;
};

type OrderSetPayload = {
  name: string;
  orderDate: Date;
  currency: string;
  financialStatus: string | null;
  totalPrice: number;
  subtotal: number;
  netRevenue: number;
  discounts: number;
  shipping: number;
  tax: number;
  refunded: number;
  cogs: number;
  lineItems: OrderLineSnapshot[];
  amountsBase: OrderAmountsBaseSnapshot;
  shippingCountryCode: string | null;
};

const moneyEq = (a: number, b: number) => Math.abs(num(a) - num(b)) < 0.005;

function lineItemsEqual(
  next: OrderLineSnapshot[],
  prev: Array<{
    productId?: string | null;
    variantId?: string | null;
    title?: string | null;
    quantity?: number;
    unitPrice?: number;
    unitCost?: number;
  }>,
): boolean {
  if (next.length !== prev.length) return false;
  for (let i = 0; i < next.length; i++) {
    const a = next[i];
    const b = prev[i];
    if (String(a.variantId) !== String(b.variantId ?? "")) return false;
    if (String(a.productId ?? "") !== String(b.productId ?? "")) return false;
    if (a.title !== (b.title ?? "")) return false;
    if (num(a.quantity) !== num(b.quantity)) return false;
    if (!moneyEq(a.unitPrice, b.unitPrice ?? 0)) return false;
    if (!moneyEq(a.unitCost, b.unitCost ?? 0)) return false;
  }
  return true;
}

function amountsBaseEqual(
  next: OrderAmountsBaseSnapshot,
  prev: OrderAmountsBaseSnapshot | null | undefined,
): boolean {
  const p = prev ?? {
    netRevenue: null,
    cogs: null,
    shipping: null,
    fees: null,
    refunded: null,
    fxRate: null,
    baseCurrency: null,
  };
  return (
    moneyEq(next.netRevenue ?? 0, p.netRevenue ?? 0) &&
    moneyEq(next.cogs ?? 0, p.cogs ?? 0) &&
    moneyEq(next.shipping ?? 0, p.shipping ?? 0) &&
    moneyEq(next.fees ?? 0, p.fees ?? 0) &&
    moneyEq(next.refunded ?? 0, p.refunded ?? 0) &&
    moneyEq(next.fxRate ?? 0, p.fxRate ?? 0) &&
    (next.baseCurrency ?? "") === (p.baseCurrency ?? "")
  );
}

function orderSetMatchesExisting(
  existing: {
    name?: string | null;
    orderDate?: Date;
    currency?: string | null;
    financialStatus?: string | null;
    totalPrice?: number;
    subtotal?: number;
    netRevenue?: number;
    discounts?: number;
    shipping?: number;
    tax?: number;
    refunded?: number;
    cogs?: number;
    lineItems?: Array<{
      productId?: string | null;
      variantId?: string | null;
      title?: string | null;
      quantity?: number;
      unitPrice?: number;
      unitCost?: number;
    }>;
    amountsBase?: OrderAmountsBaseSnapshot | null;
    shippingCountryCode?: string | null;
  },
  payload: OrderSetPayload,
): boolean {
  if ((existing.name ?? "") !== payload.name) return false;
  if (new Date(existing.orderDate!).getTime() !== payload.orderDate.getTime()) {
    return false;
  }
  if ((existing.currency ?? "").toUpperCase() !== payload.currency.toUpperCase()) {
    return false;
  }
  if (
    (existing.financialStatus ?? "").toLowerCase() !==
    (payload.financialStatus ?? "").toLowerCase()
  ) {
    return false;
  }
  if (!moneyEq(existing.totalPrice ?? 0, payload.totalPrice)) return false;
  if (!moneyEq(existing.subtotal ?? 0, payload.subtotal)) return false;
  if (!moneyEq(existing.netRevenue ?? 0, payload.netRevenue)) return false;
  if (!moneyEq(existing.discounts ?? 0, payload.discounts)) return false;
  if (!moneyEq(existing.shipping ?? 0, payload.shipping)) return false;
  if (!moneyEq(existing.tax ?? 0, payload.tax)) return false;
  if (!moneyEq(existing.refunded ?? 0, payload.refunded)) return false;
  if (!moneyEq(existing.cogs ?? 0, payload.cogs)) return false;
  if (!lineItemsEqual(payload.lineItems, existing.lineItems ?? [])) return false;
  if (
    (existing.shippingCountryCode ?? null) !==
    (payload.shippingCountryCode ?? null)
  ) {
    return false;
  }
  return amountsBaseEqual(payload.amountsBase, existing.amountsBase);
}

/** Uma página de encomendas (50) — taxas aplicadas depois via balance transactions. */
export async function syncOrdersPage(
  store: StoreDoc,
  domain: string,
  token: string,
  cursor: string | null,
  pageSize = 50,
  opts?: { fullOrderResync?: boolean },
): Promise<OrdersPageResult> {
  const resolveCost = await loadCostResolverForStore(store._id);
  const resolvePrice = await loadPriceResolverForStore(store._id);
  const workspace = await Workspace.findById(store.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = workspace?.baseCurrency ?? "EUR";
  const storeCurrency = (store.currency ?? "EUR").toUpperCase();

  const tz = normalizeStoreTimezone(store.ianaTimezone);

  // Desde quando importar: incremental (updated_at), primeira sync ou resync total (created_at).
  const searchQuery = orderSyncSearchQuery(store, opts);

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
        shippingAddress { countryCodeV2 }
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
    shippingAddress?: { countryCodeV2?: string | null } | null;
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
        "shopifyId name orderDate currency financialStatus totalPrice subtotal netRevenue discounts shipping tax refunded cogs fees lineItems amountsBase manualCogs shippingCountryCode",
      )
      .lean<Array<{
        shopifyId: string;
        name?: string | null;
        orderDate?: Date;
        currency?: string | null;
        financialStatus?: string | null;
        totalPrice?: number;
        subtotal?: number;
        netRevenue?: number;
        discounts?: number;
        shipping?: number;
        tax?: number;
        refunded?: number;
        cogs?: number;
        fees?: number | null;
        lineItems?: Array<{
          variantId?: string | null;
          unitCost?: number;
          unitPrice?: number;
        }>;
        amountsBase?: OrderAmountsBaseSnapshot | null;
        manualCogs?: number | null;
        shippingCountryCode?: string | null;
      }>>();
    const existingByShopifyId = new Map<
      string,
      (typeof existingOrders)[number]
    >();
    const existingLineMap = new Map<
      string,
      Map<string, { unitCost: number; unitPrice: number }>
    >();
    const existingFees = new Map<string, number>();
    const existingManualCogs = new Map<string, number | null>();
    for (const eo of existingOrders) {
      const sid = String(eo.shopifyId);
      existingByShopifyId.set(sid, eo);
      const m = new Map<string, { unitCost: number; unitPrice: number }>();
      for (const li of eo.lineItems ?? []) {
        m.set(String(li.variantId), {
          unitCost: num(li.unitCost),
          unitPrice: num(li.unitPrice),
        });
      }
      existingLineMap.set(sid, m);
      if (eo.fees != null) existingFees.set(sid, num(eo.fees));
      existingManualCogs.set(
        sid,
        eo.manualCogs != null ? num(eo.manualCogs) : null,
      );
    }

    const ops: AnyBulkWriteOperation[] = [];
    let inserted = 0;
    let updated = 0;
    const newOrderVariantIds = new Set<string>();

    for (const o of conn.nodes) {
      const finStatus = normalizeOrderFinancialStatus(o.displayFinancialStatus);
      if (orderShouldBeRemoved(finStatus)) {
        ops.push({
          deleteOne: {
            filter: { storeId: store._id, shopifyId: o.id },
          },
        });
        continue;
      }

      const orderDate = new Date(o.createdAt);
      const existing = existingByShopifyId.get(o.id);
      const isNew = !existing;
      const prevLine = existingLineMap.get(o.id);
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
        const catalogPrice = variantId
          ? resolvePrice(variantId, orderDate)
          : 0;
        const unitPrice = applyLineUnitPrice(
          prev?.unitPrice ?? 0,
          apiPrice > 0 ? apiPrice : catalogPrice,
        );
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

      const shippingCountryCode = normalizeShippingCountryCode(
        o.shippingAddress?.countryCodeV2,
      );

      const currency =
        o.currentTotalPriceSet?.shopMoney.currencyCode ?? store.currency;
      const payload: OrderSetPayload = {
        name: o.name,
        orderDate,
        currency,
        financialStatus: finStatus || null,
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
        shippingCountryCode,
      };

      if (
        !isNew &&
        existing &&
        orderSetMatchesExisting(
          existing as Parameters<typeof orderSetMatchesExisting>[0],
          payload,
        )
      ) {
        continue;
      }

      ops.push({
        updateOne: {
          filter: { storeId: store._id, shopifyId: o.id },
          update: {
            $set: {
              workspaceId: store.workspaceId,
              storeId: store._id,
              shopifyId: o.id,
              name: payload.name,
              orderDate: payload.orderDate,
              currency: payload.currency,
              financialStatus: payload.financialStatus,
              totalPrice: payload.totalPrice,
              subtotal: payload.subtotal,
              netRevenue: payload.netRevenue,
              discounts: payload.discounts,
              shipping: payload.shipping,
              tax: payload.tax,
              refunded: payload.refunded,
              cogs: payload.cogs,
              lineItems: payload.lineItems,
              amountsBase: payload.amountsBase,
              shippingCountryCode: payload.shippingCountryCode,
            },
            $setOnInsert: { fees: 0, feesSource: null },
          },
          upsert: true,
        },
      });
      if (isNew) {
        inserted += 1;
        for (const li of lineItems) {
          if (li.variantId) newOrderVariantIds.add(li.variantId);
        }
      } else updated += 1;
    }

  const imported = inserted + updated;
  if (ops.length) {
    await Order.bulkWrite(ops as AnyBulkWriteOperation[], { ordered: false });
  }

  return {
    imported,
    inserted,
    updated,
    newOrderVariantIds: [...newOrderVariantIds],
    nextCursor: conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null,
    hasMore: conn.pageInfo.hasNextPage,
  };
}

const SHIPPING_COUNTRY_BACKFILL_BATCH = 250;

/** Preenche país de envio em encomendas antigas (taxa UE automática). */
export async function backfillOrderShippingCountriesForStore(
  store: StoreDoc,
  domain: string,
  token: string,
  opts?: { limit?: number },
): Promise<{ updated: number; remaining: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? SHIPPING_COUNTRY_BACKFILL_BATCH, 1), 250);
  const effectiveFrom = parseDateInput(EU_CUSTOMS_FEE_EFFECTIVE_FROM);
  const minDate = effectiveFrom ? startOfDay(effectiveFrom) : new Date(0);

  const missingFilter = mergePaidOrderFilter({
    storeId: store._id,
    orderDate: { $gte: minDate },
    $or: [
      { shippingCountryCode: { $exists: false } },
      { shippingCountryCode: null },
      { shippingCountryCode: "" },
    ],
  });

  const missing = await Order.find(missingFilter)
    .select("shopifyId")
    .limit(limit)
    .lean();

  if (!missing.length) {
    return { updated: 0, remaining: 0 };
  }

  const ids = missing.map((o) => o.shopifyId).filter(Boolean);
  const query = `query OrderShippingCountries($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Order {
        id
        shippingAddress { countryCodeV2 }
      }
    }
  }`;

  type Resp = {
    nodes: Array<{
      id?: string;
      shippingAddress?: { countryCodeV2?: string | null } | null;
    } | null>;
  };

  const data = await shopifyGraphQL<Resp>(domain, token, query, { ids });
  const byId = new Map<string, string | null>();
  for (const node of data.nodes ?? []) {
    if (!node?.id) continue;
    byId.set(
      node.id,
      normalizeShippingCountryCode(node.shippingAddress?.countryCodeV2),
    );
  }

  let updated = 0;
  for (const row of missing) {
    if (!byId.has(row.shopifyId)) continue;
    const code = byId.get(row.shopifyId) ?? null;
    await Order.updateOne(
      { storeId: store._id, shopifyId: row.shopifyId },
      { $set: { shippingCountryCode: code } },
    );
    updated += 1;
  }

  const remaining = await Order.countDocuments(missingFilter);
  return { updated, remaining };
}

/** Corre todos os lotes até preencher países em falta (só actualiza shippingCountryCode). */
export async function backfillAllOrderShippingCountriesForStore(
  store: StoreDoc,
  domain: string,
  token: string,
  opts?: { maxBatches?: number },
): Promise<{ updated: number; remaining: number; batches: number }> {
  const maxBatches = Math.min(Math.max(opts?.maxBatches ?? 40, 1), 80);
  let totalUpdated = 0;
  let remaining = 0;
  let batches = 0;

  for (let i = 0; i < maxBatches; i++) {
    const r = await backfillOrderShippingCountriesForStore(store, domain, token);
    totalUpdated += r.updated;
    remaining = r.remaining;
    batches += 1;
    if (remaining <= 0) break;
    if (r.updated <= 0) break;
  }

  return { updated: totalUpdated, remaining, batches };
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

  await Order.deleteMany({
    storeId: store._id,
    financialStatus: { $regex: /^(expired|voided)$/i },
  });

  if (syncsShopifyProductCosts(store.cogsMode)) {
    await purgeLegacyManualEuFeesForStore(store._id);
    await backfillOrderShippingCountriesForStore(store, domain, token);
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
  const incremental = isIncrementalOrderSync(store);
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

  try {
    await syncAllSoldProductCatalog(store, domain, accessToken);
  } catch (e) {
    console.error("[sync] product catalog", e);
  }

  const assimilated = assimilateCogs
    ? await assimilatePendingCogsForStore(
        store._id,
        changedVariantIds.length ? { variantIds: changedVariantIds } : undefined,
      )
    : { ordersUpdated: 0, linesFilled: 0 };
  await assimilatePendingPricesForStore(store._id);

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
    await reconcileDailyMetricsForStore(storeId, {
      maxDays: incremental ? 45 : 120,
    });
  } catch (e) {
    console.error("[sync] daily metrics snapshot", e);
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
