export type BalanceTxFeeNode = {
  associatedOrderId: string | null;
  feeAmount: number;
  feeCurrency: string;
  transactionDate: Date;
  test: boolean;
  type: string | null;
};

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
