/** Estados financeiros Shopify que entram em REV/lucro (encomenda já paga). */
export const PAID_ORDER_FINANCIAL_STATUSES = [
  "paid",
  "partially_paid",
  "partially_refunded",
  "refunded",
] as const;

/** Aguardam pagamento — guardadas na BD mas não contam em métricas. */
export const PENDING_ORDER_FINANCIAL_STATUSES = [
  "pending",
  "authorized",
] as const;

/** Removidas da BD no sync (Multibanco não pago, anulada, etc.). */
export const REMOVED_ORDER_FINANCIAL_STATUSES = ["voided", "expired"] as const;

const PAID_SET = new Set<string>(PAID_ORDER_FINANCIAL_STATUSES);
const REMOVED_SET = new Set<string>(REMOVED_ORDER_FINANCIAL_STATUSES);

export const PAID_ORDER_STATUS_REGEX =
  /^(paid|partially_paid|partially_refunded|refunded)$/i;

export function normalizeOrderFinancialStatus(status?: string | null): string {
  return (status ?? "").trim().toLowerCase();
}

export function orderCountsTowardProfit(status?: string | null): boolean {
  return PAID_SET.has(normalizeOrderFinancialStatus(status));
}

export function orderShouldBeRemoved(status?: string | null): boolean {
  return REMOVED_SET.has(normalizeOrderFinancialStatus(status));
}

/** Filtro MongoDB / Mongoose — só encomendas pagas. */
export function paidOrderFindFilter(): { financialStatus: RegExp } {
  return { financialStatus: PAID_ORDER_STATUS_REGEX };
}

export function mergePaidOrderFilter(
  match: Record<string, unknown>,
): Record<string, unknown> {
  return { ...match, ...paidOrderFindFilter() };
}
