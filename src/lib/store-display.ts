/** Normaliza URL/domínio público da loja (sem protocolo, sem www, sem barra final). */
export function normalizeDisplayUrl(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function isMyshopifyDomain(input: string): boolean {
  return normalizeDisplayUrl(input).endsWith(".myshopify.com");
}

type StoreUrlFields = {
  displayUrl?: string | null;
  shopDomain?: string | null;
};

/** URL apresentado na dashboard, listagens e campo LOJA dos reports. */
export function getStoreDisplayUrl(store: StoreUrlFields): string | null {
  const custom = store.displayUrl?.trim();
  if (custom) return normalizeDisplayUrl(custom);
  const shop = store.shopDomain?.trim();
  if (!shop) return null;
  return normalizeDisplayUrl(shop);
}

/** Domínio técnico para API Shopify (.myshopify.com). */
export function getStoreShopifyDomain(store: StoreUrlFields): string | null {
  const shop = store.shopDomain?.trim();
  return shop ? normalizeDisplayUrl(shop) : null;
}
