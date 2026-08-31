import "server-only";
import { connectToDatabase } from "@/lib/db";
import { convertToBaseCurrency, moneyToBase } from "@/lib/fx";
import { dateKeyInTimezone, normalizeStoreTimezone } from "@/lib/store-timezone";
import { Order } from "@/models/Order";
import { Payout } from "@/models/Payout";
import type { StoreDoc } from "@/models/Store";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ID numérico a partir do GID Shopify (`gid://shopify/ShopifyPaymentsPayout/123`). */
export function shopifyPayoutLegacyId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1] ?? gid;
}

export type PayoutBalanceTx = {
  type: string;
  netPayout: number;
  associatedOrderId: string | null;
  /** Soma de adjustmentsOrders.amount (moeda da loja), se existir. */
  adjustmentsStoreAmount: number | null;
};

export type OrderStoreAmounts = {
  totalPrice: number;
  netRevenue: number;
  refunded: number;
  fees: number;
};

/** Valor na moeda da loja associado a uma balance transaction. */
export function orderStoreAmountForBalanceTx(
  bt: PayoutBalanceTx,
  order: OrderStoreAmounts | null,
): number | null {
  if (bt.adjustmentsStoreAmount != null && bt.adjustmentsStoreAmount !== 0) {
    const abs = Math.abs(bt.adjustmentsStoreAmount);
    return bt.netPayout >= 0 ? abs : -abs;
  }
  if (!order || !bt.associatedOrderId) return null;

  const type = bt.type.toUpperCase();
  if (type === "REFUND") {
    const refunded = num(order.refunded);
    if (refunded <= 0) return null;
    return bt.netPayout >= 0 ? refunded : -refunded;
  }

  const merchant = Math.max(
    0,
    num(order.totalPrice) - num(order.refunded) - num(order.fees),
  );
  if (merchant <= 0) return null;
  return bt.netPayout >= 0 ? merchant : -merchant;
}

/** Taxa implícita Shopify: unidades da moeda da loja por 1 unidade da moeda do payout. */
export function deriveShopifyFxRate(
  pairs: Array<{ storeAmount: number; payoutAmount: number }>,
): number | null {
  let storeSum = 0;
  let payoutSum = 0;
  for (const t of pairs) {
    storeSum += Math.abs(t.storeAmount);
    payoutSum += Math.abs(t.payoutAmount);
  }
  if (payoutSum <= 0 || storeSum <= 0) return null;
  return storeSum / payoutSum;
}

export function computePayoutNetInStoreCurrency(
  bts: PayoutBalanceTx[],
  ordersById: Map<string, OrderStoreAmounts>,
  fallbackRate: number | null,
): { netStore: number; fxRate: number | null; usedShopifyRate: boolean } {
  const pairs: Array<{ storeAmount: number; payoutAmount: number }> = [];
  let netStore = 0;
  let orphanNet = 0;

  for (const bt of bts) {
    const order = bt.associatedOrderId
      ? (ordersById.get(bt.associatedOrderId) ?? null)
      : null;
    const storeAmt = orderStoreAmountForBalanceTx(bt, order);
    if (storeAmt != null) {
      netStore += storeAmt;
      if (bt.netPayout !== 0) {
        pairs.push({ storeAmount: storeAmt, payoutAmount: bt.netPayout });
      }
    } else {
      orphanNet += bt.netPayout;
    }
  }

  const shopifyRate = deriveShopifyFxRate(pairs);
  let usedShopifyRate = shopifyRate != null;

  if (orphanNet !== 0) {
    const rate = shopifyRate ?? fallbackRate;
    if (rate != null) {
      netStore += orphanNet * rate;
      usedShopifyRate = shopifyRate != null;
    }
  }

  if (netStore === 0 && bts.length > 0 && fallbackRate != null) {
    const payoutNet = bts.reduce((s, bt) => s + bt.netPayout, 0);
    netStore = payoutNet * fallbackRate;
    usedShopifyRate = false;
    return {
      netStore: roundMoney(netStore),
      fxRate: fallbackRate,
      usedShopifyRate,
    };
  }

  return {
    netStore: roundMoney(netStore),
    fxRate: shopifyRate ?? fallbackRate,
    usedShopifyRate,
  };
}

export type PayoutFxSource = "shopify" | "market" | "identity";

export async function storeAmountToBase(
  amountStore: number,
  storeCurrency: string,
  baseCurrency: string,
  dateKey: string,
): Promise<number> {
  const store = storeCurrency.toUpperCase();
  const base = baseCurrency.toUpperCase();
  if (!amountStore) return 0;
  if (store === base) return roundMoney(amountStore);
  return moneyToBase(amountStore, store, base, dateKey);
}

/** Converte net/fee/gross do payout para moeda base (workspace). */
export async function computePayoutBaseAmounts(opts: {
  payoutNet: number;
  payoutFee: number;
  payoutGross: number;
  payoutCurrency: string;
  storeCurrency: string;
  baseCurrency: string;
  dateKey: string;
  balanceTxs: PayoutBalanceTx[];
  ordersById: Map<string, OrderStoreAmounts>;
}): Promise<{
  netBase: number;
  feeBase: number;
  grossBase: number;
  fxRate: number | null;
  fxSource: PayoutFxSource;
}> {
  const payoutCur = opts.payoutCurrency.toUpperCase();
  const storeCur = opts.storeCurrency.toUpperCase();
  const baseCur = opts.baseCurrency.toUpperCase();

  if (payoutCur === storeCur) {
    const netBase = await storeAmountToBase(
      opts.payoutNet,
      storeCur,
      baseCur,
      opts.dateKey,
    );
    const feeBase = await storeAmountToBase(
      opts.payoutFee,
      storeCur,
      baseCur,
      opts.dateKey,
    );
    const grossBase = await storeAmountToBase(
      opts.payoutGross,
      storeCur,
      baseCur,
      opts.dateKey,
    );
    return {
      netBase,
      feeBase,
      grossBase,
      fxRate: storeCur === baseCur ? 1 : null,
      fxSource: "identity",
    };
  }

  let marketRate: number | null = null;
  try {
    const fx = await convertToBaseCurrency(
      1,
      payoutCur,
      storeCur,
      opts.dateKey,
    );
    marketRate = fx.fxRate;
  } catch {
    marketRate = null;
  }

  const { netStore, fxRate, usedShopifyRate } = computePayoutNetInStoreCurrency(
    opts.balanceTxs,
    opts.ordersById,
    marketRate,
  );

  let netBase: number;
  let fxSource: PayoutFxSource;

  if (opts.balanceTxs.length > 0 && (usedShopifyRate || netStore !== 0)) {
    netBase = await storeAmountToBase(
      netStore,
      storeCur,
      baseCur,
      opts.dateKey,
    );
    fxSource = usedShopifyRate ? "shopify" : "market";
  } else if (marketRate != null) {
    netBase = await moneyToBase(
      opts.payoutNet,
      payoutCur,
      baseCur,
      opts.dateKey,
    );
    fxSource = "market";
  } else {
    netBase = await moneyToBase(
      opts.payoutNet,
      payoutCur,
      baseCur,
      opts.dateKey,
    );
    fxSource = "market";
  }

  const ratio =
    opts.payoutNet !== 0 ? netBase / opts.payoutNet : fxRate ?? marketRate;

  const scale = (v: number) =>
    ratio != null && Number.isFinite(ratio) ? roundMoney(v * ratio) : 0;

  return {
    netBase,
    feeBase: scale(opts.payoutFee),
    grossBase: scale(opts.payoutGross),
    fxRate: fxRate ?? marketRate,
    fxSource,
  };
}

async function shopifyGraphQL<T>(
  domain: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(
    `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    },
  );
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

type RawBalanceTx = {
  id: string;
  type: string | null;
  net: { amount: string; currencyCode?: string } | null;
  associatedOrder: { id: string } | null;
  adjustmentsOrders: Array<{ amount: { amount: string } | null }> | null;
};

export async function fetchPayoutBalanceTransactions(
  domain: string,
  token: string,
  payoutGid: string,
): Promise<PayoutBalanceTx[]> {
  const legacyId = shopifyPayoutLegacyId(payoutGid);
  const query = `query($cursor: String, $q: String) {
    shopifyPaymentsAccount {
      balanceTransactions(first: 100, after: $cursor, query: $q) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          type
          net { amount currencyCode }
          associatedOrder { id }
          adjustmentsOrders { amount { amount } }
        }
      }
    }
  }`;

  type Resp = {
    shopifyPaymentsAccount: {
      balanceTransactions: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: RawBalanceTx[];
      };
    } | null;
  };

  const out: PayoutBalanceTx[] = [];
  let cursor: string | null = null;
  const searchQuery = `payments_transfer_id:${legacyId}`;

  for (let page = 0; page < 30; page++) {
    const data: Resp = await shopifyGraphQL<Resp>(domain, token, query, {
      cursor,
      q: searchQuery,
    });
    const account: NonNullable<Resp["shopifyPaymentsAccount"]> | null =
      data.shopifyPaymentsAccount;
    if (!account) break;

    for (const bt of account.balanceTransactions.nodes) {
      const adjustments = bt.adjustmentsOrders ?? [];
      let adjustmentsStoreAmount: number | null = null;
      if (adjustments.length > 0) {
        adjustmentsStoreAmount = adjustments.reduce(
          (s: number, row: { amount: { amount: string } | null }) =>
            s + num(row.amount?.amount),
          0,
        );
      }
      out.push({
        type: bt.type ?? "",
        netPayout: num(bt.net?.amount),
        associatedOrderId: bt.associatedOrder?.id ?? null,
        adjustmentsStoreAmount,
      });
    }

    if (!account.balanceTransactions.pageInfo.hasNextPage) break;
    cursor = account.balanceTransactions.pageInfo.endCursor;
  }

  return out;
}

export async function enrichPayoutBaseAmountsForStore(
  store: StoreDoc,
  domain: string,
  token: string,
  baseCurrency: string,
  payoutShopifyIds: string[],
): Promise<number> {
  if (!payoutShopifyIds.length) return 0;

  await connectToDatabase();

  const storeCurrency = (store.currency ?? "EUR").toUpperCase();
  const base = baseCurrency.toUpperCase();
  const storeTz = normalizeStoreTimezone(store.ianaTimezone);

  const payouts = await Payout.find({
    storeId: store._id,
    shopifyId: { $in: payoutShopifyIds },
  }).lean();

  if (!payouts.length) return 0;

  let updated = 0;

  for (const payout of payouts) {
    const payoutCur = (payout.currency ?? storeCurrency).toUpperCase();
    const dateKey = dateKeyInTimezone(
      payout.paidAt ?? payout.issuedAt ?? new Date(),
      storeTz,
    );

    const needsShopifyFx = payoutCur !== storeCurrency;
    let balanceTxs: PayoutBalanceTx[] = [];

    if (needsShopifyFx) {
      try {
        balanceTxs = await fetchPayoutBalanceTransactions(
          domain,
          token,
          payout.shopifyId,
        );
      } catch {
        balanceTxs = [];
      }
    }

    const orderIds = [
      ...new Set(
        balanceTxs
          .map((bt) => bt.associatedOrderId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const orders = orderIds.length
      ? await Order.find({
          storeId: store._id,
          shopifyId: { $in: orderIds },
        })
          .select("shopifyId totalPrice netRevenue refunded fees")
          .lean()
      : [];

    const ordersById = new Map<string, OrderStoreAmounts>(
      orders.map((o) => [
        o.shopifyId,
        {
          totalPrice: num(o.totalPrice),
          netRevenue: num(o.netRevenue),
          refunded: num(o.refunded),
          fees: num(o.fees),
        },
      ]),
    );

    const amounts = await computePayoutBaseAmounts({
      payoutNet: num(payout.net),
      payoutFee: num(payout.fee),
      payoutGross: num(payout.gross),
      payoutCurrency: payoutCur,
      storeCurrency,
      baseCurrency: base,
      dateKey,
      balanceTxs,
      ordersById,
    });

    await Payout.updateOne(
      { _id: payout._id },
      {
        $set: {
          netBase: amounts.netBase,
          feeBase: amounts.feeBase,
          grossBase: amounts.grossBase,
          fxRate: amounts.fxRate,
          fxSource: amounts.fxSource,
        },
      },
    );
    updated++;
  }

  return updated;
}

/** Valor do payout na moeda base — preferência: netBase Shopify, senão ECB. */
export async function resolvePayoutNetBase(
  payout: {
    net?: number | null;
    netBase?: number | null;
    currency?: string | null;
    issuedAt?: Date | null;
    paidAt?: Date | null;
    createdAt?: Date;
  },
  storeCurrency: string,
  baseCurrency: string,
  dateKey: string,
): Promise<number> {
  if (payout.netBase != null && Number.isFinite(payout.netBase)) {
    return payout.netBase;
  }
  const cur = (payout.currency ?? storeCurrency).toUpperCase();
  return moneyToBase(payout.net ?? 0, cur, baseCurrency, dateKey);
}
