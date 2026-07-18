export type BalanceTxFeeNode = {
  associatedOrderId: string | null;
  feeAmount: number;
  feeCurrency: string;
  transactionDate: Date;
  test: boolean;
  type: string | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** BTs sem encomenda ou de sistema (payout/transfer) não entram no fee por order. */
export function shouldIncludeBalanceTxForOrderFees(
  node: BalanceTxFeeNode,
): boolean {
  if (node.test) return false;
  if (!node.associatedOrderId) return false;
  const type = (node.type ?? "").toUpperCase();
  if (type === "PAYOUT" || type === "TRANSFER") return false;
  return true;
}

/** Soma taxas Shopify Payments por shopifyId de encomenda (valores brutos da API). */
export function aggregateOrderFeesFromBalanceTx(
  nodes: BalanceTxFeeNode[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const node of nodes) {
    if (!shouldIncludeBalanceTxForOrderFees(node)) continue;
    const id = node.associatedOrderId!;
    map.set(id, (map.get(id) ?? 0) + node.feeAmount);
  }
  return map;
}

export type OrderTransactionFeeInput = {
  status?: string | null;
  fees?: Array<{
    amount?: { amount?: string; currencyCode?: string } | null;
  } | null> | null;
};

/**
 * Soma `Order.transactions.fees` (Shopify Payments) em transactions SUCCESS.
 * `hasFeeData` = true se alguma fee veio na API (mesmo que o total seja 0).
 */
export function sumSuccessfulTransactionFees(
  transactions: OrderTransactionFeeInput[] | null | undefined,
): { amount: number; currency: string | null; hasFeeData: boolean } {
  let amount = 0;
  let currency: string | null = null;
  let hasFeeData = false;
  for (const tx of transactions ?? []) {
    if ((tx.status ?? "").toUpperCase() !== "SUCCESS") continue;
    const fees = tx.fees ?? [];
    if (fees.length > 0) hasFeeData = true;
    for (const fee of fees) {
      const a = num(fee?.amount?.amount);
      if (!Number.isFinite(a)) continue;
      amount += a;
      if (!currency && fee?.amount?.currencyCode) {
        currency = fee.amount.currencyCode.toUpperCase();
      }
    }
  }
  return { amount: roundMoney(amount), currency, hasFeeData };
}
