export type OrderMerchantPayoutFields = {
  totalPrice?: number | null;
  netRevenue?: number | null;
  refunded?: number | null;
  fees?: number | null;
  amountsBase?: {
    netRevenue?: number | null;
    refunded?: number | null;
    fees?: number | null;
    fxRate?: number | null;
  } | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function orderFxRate(order: OrderMerchantPayoutFields): number {
  const base = order.amountsBase?.netRevenue;
  const store = order.netRevenue;
  if (base != null && store != null && store > 0) return base / store;
  const fx = order.amountsBase?.fxRate;
  return fx != null && fx > 0 ? fx : 1;
}

function orderRefundedBase(order: OrderMerchantPayoutFields): number {
  const base = order.amountsBase?.refunded;
  if (base != null) return base;
  return num(order.refunded) * orderFxRate(order);
}

function orderFeesBase(order: OrderMerchantPayoutFields): number {
  const base = order.amountsBase?.fees;
  if (base != null) return base;
  return num(order.fees) * orderFxRate(order);
}

/** Valor líquido que entra na conta (total − reembolsos − taxas). */
export function orderMerchantPayoutBase(order: OrderMerchantPayoutFields): number {
  const fx = orderFxRate(order);
  const total = num(order.totalPrice) * fx;
  const refunded = orderRefundedBase(order);
  const fees = orderFeesBase(order);
  return Math.max(0, Math.round((total - refunded - fees) * 100) / 100);
}
