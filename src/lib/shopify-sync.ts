import "server-only";
import type { AnyBulkWriteOperation } from "mongoose";
import { orderNetRevenue } from "@/lib/order-revenue";
import { connectToDatabase } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import {
  normalizeShopDomain,
  SHOPIFY_API_VERSION,
  getClientCredentialsToken,
  testShopifyConnection,
} from "@/lib/shopify";
import { Store, type StoreDoc } from "@/models/Store";
import { Order } from "@/models/Order";
import { ProductCost } from "@/models/ProductCost";
import {
  applyLineUnitCost,
  assimilatePendingCogsForStore,
  loadCostResolverForStore,
  mergeAssimilateResults,
  recordShopifyCostChange,
} from "@/lib/cogs";
import { syncSessionMetricsForStore } from "@/lib/session-metrics";
import { Payout } from "@/models/Payout";
import { BalanceTransaction } from "@/models/BalanceTransaction";

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

/** Importa/atualiza o custo por variante (COGS) de todas as variantes. */
async function syncProductCosts(
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
    .select("variantId unitCost")
    .lean();
  const prevCosts = new Map(
    existing.map((c) => [String(c.variantId), num(c.unitCost)]),
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
              price: num(v.price),
              unitCost: newCost,
              currency: store.currency,
            },
          },
          upsert: true,
        },
        newCost,
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
        const prev = prevCosts.get(variantId);
        const changed = prev === undefined || prev !== op.newCost;
        if (changed) {
          await recordShopifyCostChange(
            store._id,
            variantId,
            op.newCost,
            prev === undefined ? new Date(0) : effectiveFrom,
            op.productId,
          );
          prevCosts.set(variantId, op.newCost);
          changedVariantIds.push(variantId);
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

/** Importa orders (com COGS por linha e taxas estimadas pelo feeConfig). */
async function syncOrders(
  store: StoreDoc,
  domain: string,
  token: string,
): Promise<number> {
  const resolveCost = await loadCostResolverForStore(store._id);

  // Desde quando importar: data definida na loja, última sync, ou 90 dias.
  const since =
    store.lastSyncAt ??
    store.importStartDate ??
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const searchQuery = `created_at:>=${since.toISOString()}`;

  const fee = store.feeConfig ?? {};
  const feePercent =
    (num(fee.processingPercent) + num(fee.transactionFeePercent)) / 100;
  const feeFixed = num(fee.processingFixed);

  const query = `query($cursor: String, $q: String) {
    orders(first: 50, after: $cursor, query: $q, sortKey: CREATED_AT) {
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

  let cursor: string | null = null;
  let count = 0;

  // Até 40 páginas (2000 orders) por execução.
  for (let page = 0; page < 40; page++) {
    const data: Resp = await shopifyGraphQL<Resp>(domain, token, query, {
      cursor,
      q: searchQuery,
    });
    const conn = data.orders;

    // Custos já registados nestas encomendas (snapshot imutável do passado).
    const ids = conn.nodes.map((o) => o.id);
    const existingOrders = await Order.find({
      storeId: store._id,
      shopifyId: { $in: ids },
    })
      .select("shopifyId lineItems.variantId lineItems.unitCost")
      .lean();
    const existingMap = new Map<string, Map<string, number>>();
    for (const eo of existingOrders) {
      const m = new Map<string, number>();
      for (const li of eo.lineItems ?? []) {
        m.set(String(li.variantId), num(li.unitCost));
      }
      existingMap.set(String(eo.shopifyId), m);
    }

    const ops = conn.nodes.map((o) => {
      const orderDate = new Date(o.createdAt);
      const prevLine = existingMap.get(o.id);
      const lineItems = o.lineItems.nodes.map((li) => {
        const variantId = li.variant?.id ?? "";
        const prev = prevLine?.get(variantId) ?? 0;
        const unitCost = applyLineUnitCost(
          variantId,
          orderDate,
          prev,
          resolveCost,
        );
        return {
          productId: li.product?.id,
          variantId,
          title: li.title,
          quantity: num(li.quantity),
          unitPrice: num(li.originalUnitPriceSet?.shopMoney.amount),
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
      const netRevenue = orderNetRevenue({ subtotal, totalPrice, refunded });
      const fees = totalPrice * feePercent + (totalPrice > 0 ? feeFixed : 0);

      return {
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
              shipping: num(o.totalShippingPriceSet?.shopMoney.amount),
              tax: num(o.totalTaxSet?.shopMoney.amount),
              refunded,
              cogs,
              fees,
              lineItems,
            },
          },
          upsert: true,
        },
      };
    });

    if (ops.length) {
      await Order.bulkWrite(ops as AnyBulkWriteOperation[], { ordered: false });
      count += ops.length;
    }

    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return count;
}

/**
 * Importa payouts do Shopify Payments e o saldo atual (por pagar).
 * Tolerante a falhas: se a loja não usar Shopify Payments ou faltar o scope,
 * devolve 0 sem quebrar o resto da sincronização.
 */
async function syncPayouts(
  store: StoreDoc,
  domain: string,
  token: string,
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

  // Até 6 páginas (300 payouts) por execução.
  // Nota: erros (ex.: falta de scope read_shopify_payments_accounts) propagam
  // para serem registados em store.payoutsError, em vez de desaparecerem.
  for (let page = 0; page < 6; page++) {
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
async function syncIncomingBalanceTransactions(
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
  payoutsError?: string;
  sessionMetricsError?: string;
};

/** Sincroniza uma loja: custos de produtos + orders. */
export async function syncStore(storeId: string): Promise<SyncResult> {
  await connectToDatabase();
  const store = await Store.findById(storeId);
  if (!store) throw new Error("Loja não encontrada.");
  if (store.platform !== "shopify") {
    throw new Error("Só lojas Shopify são suportadas de momento.");
  }

  const creds = getStoreCredentials(store);
  const domain = normalizeShopDomain(store.shopDomain ?? "");

  // Token fresco (client credentials) — válido ~24h, pedido a cada sync.
  const { accessToken } = await getClientCredentialsToken(
    domain,
    creds.clientId,
    creds.clientSecret,
  );

  try {
    const shop = await testShopifyConnection(domain, accessToken);
    if (shop.ianaTimezone) {
      store.ianaTimezone = shop.ianaTimezone;
    }
  } catch {
    /* sync continua se o ping da shop falhar */
  }

  const { count: products } = await syncProductCosts(store, domain, accessToken);
  const assimilatedBefore = await assimilatePendingCogsForStore(store._id);
  const orders = await syncOrders(store, domain, accessToken);
  const assimilatedAfter = await assimilatePendingCogsForStore(store._id);
  const assimilated = mergeAssimilateResults(assimilatedBefore, assimilatedAfter);

  // Payouts são opcionais: um erro aqui (ex.: scope em falta) não deve
  // impedir a sync de orders/produtos. Registamos o erro na loja.
  let payouts = 0;
  let balanceTransactions = 0;
  let payoutsError: string | undefined;
  try {
    payouts = await syncPayouts(store, domain, accessToken);
    balanceTransactions = await syncIncomingBalanceTransactions(
      store,
      domain,
      accessToken,
    );
  } catch (e) {
    payoutsError = e instanceof Error ? e.message : "Falha a obter payouts.";
  }
  store.payoutsError = payoutsError ?? null;

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

  store.lastSyncAt = new Date();
  await store.save();

  return {
    products,
    orders,
    payouts,
    balanceTransactions,
    cogsOrdersUpdated: assimilated.ordersUpdated,
    cogsLinesFilled: assimilated.linesFilled,
    sessionMetricsDays,
    payoutsError,
    sessionMetricsError,
  };
}
