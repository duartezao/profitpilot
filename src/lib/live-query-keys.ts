/** Prefixos de queryKey actualizados ao voltar à app (PWA / mudança de janela). */
export const LIVE_QUERY_PREFIXES = new Set([
  "metrics-summary",
  "dashboard-summary",
  "portfolio-summary",
  "treasury",
  "metrics-treasury",
  "ad-spend-view",
  "ad-campaigns",
  "decision-summary",
  "payouts",
  "products-ranking",
]);

export function isLiveQueryKey(queryKey: readonly unknown[]): boolean {
  const prefix = queryKey[0];
  return typeof prefix === "string" && LIVE_QUERY_PREFIXES.has(prefix);
}
