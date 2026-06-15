import "server-only";
import type { AnyBulkWriteOperation } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import {
  computeOrderFees,
  ensureFeeSchedule,
  resolveFeeConfigForDateKey,
  shopifyCurrencyConversionPercent,
  type FeeScheduleEntry,
} from "@/lib/fee-schedule";
import { convertToBaseCurrency } from "@/lib/fx";
import { buildOrderAmountsBase } from "@/lib/order-money";
import { orderNetRevenue } from "@/lib/order-revenue";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";
import {
  dateKeyInTimezone,
  importDateKey,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import { Order } from "@/models/Order";
import { Store, type StoreDoc } from "@/models/Store";
import { Workspace } from "@/models/Workspace";

import {
  aggregateOrderFeesFromBalanceTx,
  shouldIncludeBalanceTxForOrderFees,
  type BalanceTxFeeNode,
} from "@/lib/order-fees-aggregate";

export type OrderFeesSource = "real" | "estimated";
export type { BalanceTxFeeNode };
export { aggregateOrderFeesFromBalanceTx, shouldIncludeBalanceTxForOrderFees };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
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
  if (!res.ok) throw new Error(`Shopify GraphQL HTTP ${res.status}`);
  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Shopify GraphQL sem dados.");
  return json.data;
}

/** Converte taxa da moeda do BT para a moeda da loja. */
async function feeToStoreCurrency(
  amount: number,
  feeCurrency: string,
  storeCurrency: string,
  baseCurrency: string,
  dateKey: string,
): Promise<number> {
  const from = feeCurrency.toUpperCase();
  const store = storeCurrency.toUpperCase();
  if (from === store) return roundMoney(amount);

  const inBase = await convertToBaseCurrency(
    amount,
    from,
    baseCurrency,
    dateKey,
  );
  if (store === baseCurrency.toUpperCase()) return inBase.amountBase;

  const unitStore = await convertToBaseCurrency(
    1,
    store,
    baseCurrency,
    dateKey,
  );
  if (!unitStore.fxRate) return inBase.amountBase;
  return roundMoney(inBase.amountBase / unitStore.fxRate);
}

type FetchBalanceTxResult = {
  nodes: BalanceTxFeeNode[];
  hasAccount: boolean;
};

/** Importa balance transactions com taxa e encomenda associada. */
export async function fetchOrderFeeBalanceTransactions(
  domain: string,
  token: string,
  importFloorIso: string,
): Promise<FetchBalanceTxResult> {
  const query = `query($cursor: String, $q: String) {
    shopifyPaymentsAccount {
      balanceTransactions(first: 100, after: $cursor, query: $q, sortKey: PROCESSED_AT, reverse: false) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          type
          test
          transactionDate
          fee { amount }
          amount { amount currencyCode }
          associatedOrder { id }
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
          type: string | null;
          test: boolean;
          transactionDate: string;
          fee: { amount: string } | null;
          amount: { amount: string; currencyCode?: string } | null;
          associatedOrder: { id: string } | null;
        }>;
      };
    } | null;
  };

  const nodes: BalanceTxFeeNode[] = [];
  let cursor: string | null = null;
  const searchQuery = `processed_at:>=${importFloorIso}`;

  for (let page = 0; page < 250; page++) {
    const data: Resp = await shopifyGraphQL<Resp>(domain, token, query, {
      cursor,
      q: searchQuery,
    });
    const account = data.shopifyPaymentsAccount;
    if (!account) return { nodes, hasAccount: false };

    for (const bt of account.balanceTransactions.nodes) {
      nodes.push({
        associatedOrderId: bt.associatedOrder?.id ?? null,
        feeAmount: num(bt.fee?.amount),
        feeCurrency: (
          bt.amount?.currencyCode ?? "EUR"
        ).toUpperCase(),
        transactionDate: new Date(bt.transactionDate),
        test: bt.test,
        type: bt.type,
      });
    }

    if (!account.balanceTransactions.pageInfo.hasNextPage) break;
    cursor = account.balanceTransactions.pageInfo.endCursor;
  }

  return { nodes, hasAccount: true };
}

export type ApplyOrderFeesResult = {
  updated: number;
  real: number;
  estimated: number;
  hasShopifyPayments: boolean;
};

/**
 * Aplica taxas reais (balance transactions) ou estimadas (fallback) a todas as
 * encomendas importadas da loja.
 */
export async function applyOrderFeesFromShopify(
  store: StoreDoc,
  domain: string,
  token: string,
): Promise<ApplyOrderFeesResult> {
  await connectToDatabase();

  const workspace = await Workspace.findById(store.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = workspace?.baseCurrency ?? "EUR";
  const storeCurrency = (store.currency ?? "EUR").toUpperCase();
  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const floorKey =
    importDateKey(store.importStartDate, store.createdAt, tz) ??
    dateKeyInTimezone(new Date(store.createdAt ?? Date.now()), tz);
  const floorDay = new Date(`${floorKey}T00:00:00.000Z`);
  const importFloorIso = floorDay.toISOString();

  const feeSchedule = ensureFeeSchedule(
    store.feeSchedule as FeeScheduleEntry[] | undefined,
    store.feeConfig,
    floorKey,
  );

  let nodes: BalanceTxFeeNode[] = [];
  let hasAccount = false;
  try {
    const fetched = await fetchOrderFeeBalanceTransactions(
      domain,
      token,
      importFloorIso,
    );
    nodes = fetched.nodes;
    hasAccount = fetched.hasAccount;
  } catch {
    /* Sem Shopify Payments ou scope payouts — todas as taxas ficam estimadas. */
  }

  const storeFeeMap = new Map<string, number>();
  for (const node of nodes) {
    if (!shouldIncludeBalanceTxForOrderFees(node)) continue;
    const orderId = node.associatedOrderId!;
    const dateKey = dateKeyInTimezone(node.transactionDate, tz);
    const inStore = await feeToStoreCurrency(
      node.feeAmount,
      node.feeCurrency,
      storeCurrency,
      baseCurrency,
      dateKey,
    );
    storeFeeMap.set(orderId, (storeFeeMap.get(orderId) ?? 0) + inStore);
  }

  const orders = await Order.find({ storeId: store._id })
    .select(
      "shopifyId orderDate totalPrice subtotal refunded shipping cogs manualCogs fees feesSource",
    )
    .lean();

  let real = 0;
  let estimated = 0;
  const bulk: AnyBulkWriteOperation[] = [];

  for (const order of orders) {
    const orderDate = new Date(order.orderDate);
    const orderDateKey = dateKeyInTimezone(orderDate, tz);
    const totalPrice = num(order.totalPrice);
    const subtotal = num(order.subtotal);
    const refunded = num(order.refunded);
    const shipping = num(order.shipping);
    const manualCogs = order.manualCogs ?? null;
    const cogsForBase = manualCogs != null ? manualCogs : num(order.cogs);
    const netRevenue = orderNetRevenue({ subtotal, totalPrice, refunded });

    const shopifyId = String(order.shopifyId);
    const hasRealFee = hasAccount && storeFeeMap.has(shopifyId);
    const realFee = storeFeeMap.get(shopifyId) ?? 0;

    let fees: number;
    let feesSource: OrderFeesSource;

    if (hasRealFee) {
      fees = roundMoney(Math.max(0, realFee));
      feesSource = "real";
      real++;
    } else {
      const feeConfig = resolveFeeConfigForDateKey(
        feeSchedule,
        store.feeConfig,
        orderDateKey,
        floorKey,
      );
      const conversionPercent = shopifyCurrencyConversionPercent(
        storeCurrency,
        baseCurrency,
      );
      fees = computeOrderFees(totalPrice, feeConfig, conversionPercent);
      feesSource = "estimated";
      estimated++;
    }

    const amountsBase = await buildOrderAmountsBase(
      {
        subtotal,
        totalPrice,
        refunded,
        netRevenue,
        cogs: cogsForBase,
        shipping,
        fees,
      },
      storeCurrency,
      baseCurrency,
      orderDate,
      tz,
      manualCogs,
    );

    bulk.push({
      updateOne: {
        filter: { _id: order._id },
        update: { $set: { fees, feesSource, amountsBase } },
      },
    });
  }

  if (bulk.length) {
    await Order.bulkWrite(bulk, { ordered: false });
  }

  return {
    updated: bulk.length,
    real,
    estimated,
    hasShopifyPayments: hasAccount,
  };
}
