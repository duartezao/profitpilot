import "server-only";
import { convertToBaseCurrency } from "@/lib/fx";
import { orderNetRevenue } from "@/lib/order-revenue";
import { dateKeyInTimezone, normalizeStoreTimezone } from "@/lib/store-timezone";

export type OrderAmountsBase = {
  netRevenue: number;
  cogs: number;
  shipping: number;
  fees: number;
  refunded: number;
  fxRate: number;
  baseCurrency: string;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Expressões MongoDB — preferem valores convertidos para a moeda base. */
export const netRevenueSumBaseExpr = {
  $sum: { $ifNull: ["$amountsBase.netRevenue", "$netRevenue"] },
} as const;

export const shippingSumBaseExpr = {
  $sum: { $ifNull: ["$amountsBase.shipping", "$shipping"] },
} as const;

export const feesSumBaseExpr = {
  $sum: { $ifNull: ["$amountsBase.fees", "$fees"] },
} as const;

export const refundsSumBaseExpr = {
  $sum: { $ifNull: ["$amountsBase.refunded", "$refunded"] },
} as const;

export const cogsSumBaseExpr = {
  $sum: { $ifNull: ["$amountsBase.cogs", "$cogs"] },
} as const;

/** COGS por encomenda: manual > convertido > linha. */
export const orderModeCogsSumExpr = {
  $sum: {
    $ifNull: ["$manualCogs", { $ifNull: ["$amountsBase.cogs", "$cogs"] }],
  },
} as const;

export async function buildOrderAmountsBase(
  order: {
    subtotal?: number | null;
    totalPrice?: number | null;
    refunded?: number | null;
    netRevenue?: number | null;
    cogs?: number | null;
    shipping?: number | null;
    fees?: number | null;
  },
  storeCurrency: string,
  baseCurrency: string,
  orderDate: Date,
  storeTimeZone?: string | null,
  manualCogs?: number | null,
): Promise<OrderAmountsBase> {
  const from = storeCurrency.toUpperCase();
  const to = baseCurrency.toUpperCase();
  const dateKey = dateKeyInTimezone(orderDate, normalizeStoreTimezone(storeTimeZone));

  const netRev = order.netRevenue ?? orderNetRevenue(order);
  const cogs = manualCogs != null ? manualCogs : num(order.cogs);
  const shipping = num(order.shipping);
  const fees = num(order.fees);
  const refunded = num(order.refunded);

  if (from === to) {
    return {
      netRevenue: roundMoney(netRev),
      cogs: roundMoney(cogs),
      shipping: roundMoney(shipping),
      fees: roundMoney(fees),
      refunded: roundMoney(refunded),
      fxRate: 1,
      baseCurrency: to,
    };
  }

  const fx = await convertToBaseCurrency(1, from, to, dateKey);
  const rate = fx.fxRate;

  return {
    netRevenue: roundMoney(netRev * rate),
    cogs: roundMoney(cogs * rate),
    shipping: roundMoney(shipping * rate),
    fees: roundMoney(fees * rate),
    refunded: roundMoney(refunded * rate),
    fxRate: rate,
    baseCurrency: to,
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

type OrderMoneyFields = {
  subtotal?: number | null;
  totalPrice?: number | null;
  refunded?: number | null;
  netRevenue?: number | null;
  cogs?: number | null;
  shipping?: number | null;
  fees?: number | null;
  manualCogs?: number | null;
  amountsBase?: {
    netRevenue?: number | null;
    cogs?: number | null;
    shipping?: number | null;
    fees?: number | null;
    refunded?: number | null;
    fxRate?: number | null;
    baseCurrency?: string | null;
  } | null;
};

/** Taxa loja → moeda base (derivada de amountsBase quando existir). */
export function orderFxRate(order: OrderMoneyFields): number {
  const base = order.amountsBase?.netRevenue;
  const store = order.netRevenue ?? orderNetRevenue(order);
  if (base != null && store > 0) return base / store;
  const fx = order.amountsBase?.fxRate;
  return fx != null && fx > 0 ? fx : 1;
}

export function orderNetRevenueBase(order: OrderMoneyFields): number {
  const base = order.amountsBase?.netRevenue;
  if (base != null) return base;
  return (order.netRevenue ?? orderNetRevenue(order)) * orderFxRate(order);
}

export function orderRefundedBase(order: OrderMoneyFields): number {
  const base = order.amountsBase?.refunded;
  if (base != null) return base;
  return num(order.refunded) * orderFxRate(order);
}

export function orderCogsBase(order: OrderMoneyFields): number {
  if (order.manualCogs != null) return order.manualCogs;
  const base = order.amountsBase?.cogs;
  if (base != null) return base;
  return num(order.cogs) * orderFxRate(order);
}

export function orderShippingBase(order: OrderMoneyFields): number {
  const base = order.amountsBase?.shipping;
  if (base != null) return base;
  return num(order.shipping) * orderFxRate(order);
}

export function orderFeesBase(order: OrderMoneyFields): number {
  const base = order.amountsBase?.fees;
  if (base != null) return base;
  return num(order.fees) * orderFxRate(order);
}

export function orderProfitBase(order: OrderMoneyFields): number {
  return (
    orderNetRevenueBase(order) -
    orderCogsBase(order) -
    orderShippingBase(order) -
    orderFeesBase(order)
  );
}

/** Converte entrada manual de COGS para a moeda da loja (linhas de encomenda). */
export async function convertCogsInputToStoreCurrency(
  inputAmount: number,
  inputCurrency: string,
  storeCurrency: string,
  dateKey: string,
): Promise<number> {
  const from = inputCurrency.toUpperCase();
  const to = storeCurrency.toUpperCase();
  if (from === to) return roundMoney(inputAmount);
  const fx = await convertToBaseCurrency(inputAmount, from, to, dateKey);
  return fx.amountBase;
}
