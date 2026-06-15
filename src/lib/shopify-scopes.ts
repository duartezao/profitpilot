/** Scopes Admin API necessários (só leitura). Fonte única para setup e validação. */
export const SHOPIFY_REQUIRED_SCOPES = [
  "read_orders",
  "read_all_orders",
  "read_products",
  "read_inventory",
  "read_fulfillments",
  "read_returns",
  /** Saldo Shopify Payments (`shopifyPaymentsAccount`). */
  "read_shopify_payments_accounts",
  /** Payouts e balance transactions (`payouts`, `balanceTransactions`). */
  "read_shopify_payments_payouts",
  "read_shopify_payments_disputes",
  "read_reports",
] as const;

export const SHOPIFY_PAYOUTS_SCOPES = [
  "read_shopify_payments_accounts",
  "read_shopify_payments_payouts",
] as const;

export function parseShopifyScopeList(scope: string): Set<string> {
  return new Set(
    scope
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function missingShopifyScopes(
  grantedScope: string,
  required: readonly string[] = SHOPIFY_REQUIRED_SCOPES,
): string[] {
  const granted = parseShopifyScopeList(grantedScope);
  return required.filter((s) => !granted.has(s));
}

export function formatMissingScopesMessage(missing: string[]): string {
  if (missing.length === 0) return "";
  return (
    `Scopes em falta na app Shopify: ${missing.join(", ")}. ` +
    "Adiciona-os em Dev Dashboard → Configuration → Admin API access scopes " +
    "e reinstala a app na loja para aplicar as novas permissões."
  );
}

/** Mensagem acionável quando a Shopify nega payouts / balance transactions. */
export function enhancePayoutsError(error: string): string {
  const lower = error.toLowerCase();
  if (
    !lower.includes("access denied") ||
    (!lower.includes("payout") && !lower.includes("balancetransaction"))
  ) {
    return error;
  }
  return (
    `${error} — Ativa read_shopify_payments_payouts (e read_shopify_payments_accounts) ` +
    "na app, reinstala-a na loja e volta a sincronizar."
  );
}
