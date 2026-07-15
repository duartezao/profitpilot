/** Modos de COGS configurados no setup da loja. */
export const COGS_MODES = ["shopify", "variant", "order", "day"] as const;
export type CogsMode = (typeof COGS_MODES)[number];

/** Moedas aceites na entrada manual de COGS. */
export const COGS_INPUT_CURRENCIES = ["EUR", "USD"] as const;
export type CogsInputCurrency = (typeof COGS_INPUT_CURRENCIES)[number];

export function isCogsMode(v: string): v is CogsMode {
  return (COGS_MODES as readonly string[]).includes(v);
}

export function isCogsInputCurrency(v: string): v is CogsInputCurrency {
  return (COGS_INPUT_CURRENCIES as readonly string[]).includes(v);
}

export function defaultCogsMode(): CogsMode {
  return "shopify";
}

export function defaultCogsInputCurrency(): CogsInputCurrency {
  return "EUR";
}

/** Top produtos por unidades vendidas (em vez de lucro). */
export function ranksProductsByUnits(mode: CogsMode | null | undefined): boolean {
  return mode === "order" || mode === "day";
}

/** Só o modo `shopify` importa custos de variante da Shopify no sync. */
export function syncsShopifyProductCosts(
  mode: CogsMode | null | undefined,
): boolean {
  return (mode ?? defaultCogsMode()) === "shopify";
}

/** Taxa alfandegária UE automática (Win-Win) — só com COGS automático Shopify. */
export function appliesAutoEuCustomsFees(
  mode: CogsMode | null | undefined,
): boolean {
  return syncsShopifyProductCosts(mode);
}

/** Assimilação automática de COGS nas encomendas após sync. */
export function assimilatesCogsOnSync(
  mode: CogsMode | null | undefined,
): boolean {
  const m = mode ?? defaultCogsMode();
  return m === "shopify" || m === "variant";
}

/** Avisos e listagens «produto sem COGS» — só modos Shopify ou variante manual. */
export function tracksVariantCogs(
  mode: CogsMode | null | undefined,
): boolean {
  const m = mode ?? defaultCogsMode();
  return m === "shopify" || m === "variant";
}

export const COGS_MODE_LABELS: Record<CogsMode, string> = {
  shopify: "Automático (Shopify)",
  variant: "Por variante (manual)",
  order: "Por encomenda",
  day: "Por dia",
};
