/**
 * Extrai handles Shopify a partir de URLs de destino de ads.
 * - /collections/{handle} → coleção (com ou sem prefixo de idioma)
 * - /products/{handle} → produto (depois mapeado à coleção principal)
 */

const COLLECTION_PATH_RE = /\/collections\/([^/?#]+)/i;
const PRODUCT_PATH_RE = /\/products\/([^/?#]+)/i;

export function normalizeShopifyHandle(raw: string): string {
  try {
    let h = decodeURIComponent(raw).trim().toLowerCase();
    h = h.replace(/\/+$/, "");
    return h;
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, "");
  }
}

/** @deprecated use normalizeShopifyHandle */
export const normalizeCollectionHandle = normalizeShopifyHandle;

function urlPathname(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).pathname;
    }
    if (trimmed.startsWith("//")) {
      return new URL(`https:${trimmed}`).pathname;
    }
  } catch {
    /* path relativo ou URL inválida */
  }
  return trimmed;
}

function extractHandle(
  url: string | null | undefined,
  re: RegExp,
): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const path = urlPathname(trimmed);
  const m = path.match(re) ?? trimmed.match(re);
  if (!m?.[1]) return null;
  const handle = normalizeShopifyHandle(m[1]);
  return handle || null;
}

/** Devolve o handle se a URL apontar para /collections/{handle}. */
export function extractCollectionHandleFromUrl(
  url: string | null | undefined,
): string | null {
  return extractHandle(url, COLLECTION_PATH_RE);
}

/** Devolve o handle se a URL apontar para /products/{handle}. */
export function extractProductHandleFromUrl(
  url: string | null | undefined,
): string | null {
  return extractHandle(url, PRODUCT_PATH_RE);
}

function uniqueHandles(
  urls: Array<string | null | undefined>,
  extract: (url: string | null | undefined) => string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const h = extract(url);
    if (!h || seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out;
}

/** URLs únicas → handles de coleção únicos (ordem estável). */
export function extractCollectionHandlesFromUrls(
  urls: Array<string | null | undefined>,
): string[] {
  return uniqueHandles(urls, extractCollectionHandleFromUrl);
}

/** URLs únicas → handles de produto únicos (ordem estável). */
export function extractProductHandlesFromUrls(
  urls: Array<string | null | undefined>,
): string[] {
  return uniqueHandles(urls, extractProductHandleFromUrl);
}

/** Normaliza e deduplica URLs de destino. */
export function normalizeLandingUrls(
  urls: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw || typeof raw !== "string") continue;
    let u = raw.trim();
    if (!u) continue;
    // Remove tracking fragment noise but keep query (UTM não afecta o path)
    try {
      if (/^https?:\/\//i.test(u) || u.startsWith("//")) {
        const parsed = new URL(u.startsWith("//") ? `https:${u}` : u);
        u = `${parsed.origin}${parsed.pathname}`;
      }
    } catch {
      /* mantém raw */
    }
    u = u.replace(/\/+$/, "") || u;
    const key = u.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}
