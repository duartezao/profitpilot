import "server-only";
import * as cheerio from "cheerio";
import http from "node:http";
import https from "node:https";
import {
  countryFromStoreSignals,
  extractCanonicalLegalName,
  isPlausibleStoreHost,
  normalizeHost,
} from "./normalize";

const LEGAL_PATHS = [
  "/pages/impressum",
  "/pages/company-information",
  "/pages/legal-notice",
  "/pages/legal",
  "/pages/privacy-policy",
  "/pages/datenschutz",
  "/pages/politique-de-confidentialite",
  "/pages/informativa-sulla-privacy",
  "/pages/aviso-legal",
  "/policies/privacy-policy",
  "/policies/legal-notice",
  "/impressum",
  "/privacy",
  "/privacy-policy",
];

/** Só nomes curtos: «Brand LLC», não frases inteiras que acabam em LLC. */
const LEGAL_NAME_RE =
  /\b([A-Z][A-Za-z0-9&.'\-]{1,40}(?:\s+[A-Z][A-Za-z0-9&.'\-]{1,40}){0,3}\s(?:LLC|L\.L\.C\.|Limited|Ltd\.?|Inc\.?|GmbH|S\.?A\.?|S\.?L\.?|BV|B\.V\.|SAS|SARL|Oy|AB|Pty Ltd))\b/g;

const ENTITY_ID_RE = /(?:Wyoming\s+)?Entity\s+ID[:\s#]*([0-9\-]+)/i;
/** Operadora / advertising entity nas privacy (ex. Logos Ecom LLC). */
const OPERATED_RE =
  /(?:Operated by|Betrieben von|Üzemeltető|Handelsmarke der|trade name of|Handelsname der|Business operated by|managed by|advertising services are managed by|data processing and advertising services are managed by|Nombre de la empresa|operado por|gestito da|Operated\s+by)\s*[:\s]*([A-Za-z0-9&.'\- ]{3,80}?(?:LLC|L\.L\.C\.|Limited|Ltd\.?|Inc\.?|GmbH))/gi;

export type ImpressumResult = {
  host: string;
  ok: boolean;
  isShopify: boolean | null;
  legalNames: string[];
  /** Domains mencionados nas páginas legais (irmãs / outras lojas). */
  relatedHosts: string[];
  entityId: string | null;
  brandName: string | null;
  sourcePath: string | null;
  /** País ISO — preferência lang/locale da loja, senão TLD. */
  country: string | null;
  htmlLang: string | null;
  error?: string;
};

const RELATED_HOST_RE =
  /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|shop|store|at|de|ch|hu|nl|be|fr|it|es|pt|pl|se|dk|no|fi|ie|uk|co\.uk|com\.au))\b/gi;

function extractRelatedHosts(text: string, selfHost: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(RELATED_HOST_RE)) {
    const h = normalizeHost(m[1] ?? "");
    if (!h || h === selfHost) continue;
    if (!isPlausibleStoreHost(h)) continue;
    found.add(h);
  }
  return [...found];
}

async function fetchText(url: string): Promise<string | null> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
  };
  try {
    const res = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(18000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text") && !ct.includes("html") && !ct.includes("json")) {
      return null;
    }
    return await res.text();
  } catch {
    // Muitas lojas competitor têm SSL partido — retry Node https inseguro
    return fetchTextInsecure(url, headers);
  }
}

function fetchTextInsecure(
  url: string,
  headers: Record<string, string>,
  redirects = 0,
): Promise<string | null> {
  if (redirects > 5) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith("http:") ? http : https;
      const req = lib.get(
        url,
        {
          headers,
          timeout: 18000,
          rejectUnauthorized: false,
        },
        (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            const next = res.headers.location.startsWith("http")
              ? res.headers.location
              : new URL(res.headers.location, url).toString();
            void fetchTextInsecure(next, headers, redirects + 1).then(resolve);
            return;
          }
          if (!res.statusCode || res.statusCode >= 400) {
            resolve(null);
            return;
          }
          res.setEncoding("utf8");
          let body = "";
          res.on("data", (c) => {
            body += c;
          });
          res.on("end", () => resolve(body || null));
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

function extractLegalNames(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(OPERATED_RE)) {
    const canonical = extractCanonicalLegalName(m[1] ?? "");
    if (canonical) found.add(canonical);
  }
  for (const m of text.matchAll(LEGAL_NAME_RE)) {
    const canonical = extractCanonicalLegalName(m[1] ?? "");
    if (canonical) found.add(canonical);
  }
  // Fallback: procura canónicos em todo o texto (apanha «… of CAVALEIRUS LLC»)
  const fromBlob = extractCanonicalLegalName(text.slice(0, 4000));
  if (fromBlob) found.add(fromBlob);
  return [...found];
}

function detectShopify(html: string): boolean {
  return (
    html.includes("cdn.shopify.com") ||
    html.includes("Shopify.theme") ||
    html.includes("Shopify.shop") ||
    html.includes("myshopify.com") ||
    html.includes("shopify-section") ||
    html.includes("shopify-payment-button")
  );
}

/** Fallback quando a home está atrás de bot-wall / HTML mínimo. */
async function detectShopifyViaApi(base: string): Promise<boolean> {
  for (const path of ["/products.json", "/meta.json", "/cart.js"]) {
    const body = await fetchText(`${base}${path}`);
    if (!body) continue;
    if (path === "/products.json" && /"products"\s*:/.test(body)) return true;
    if (path === "/meta.json" && /myshopify|shopify/i.test(body)) return true;
    if (path === "/cart.js" && /"token"\s*:/.test(body)) return true;
  }
  return false;
}

export async function crawlImpressum(hostInput: string): Promise<ImpressumResult> {
  const host = normalizeHost(hostInput);
  const base = `https://${host}`;
  let homeHtml = await fetchText(base);
  if (!homeHtml) {
    homeHtml = await fetchText(`http://${host}`);
  }
  let isShopify: boolean | null = homeHtml ? detectShopify(homeHtml) : null;
  if (isShopify !== true) {
    const viaApi = await detectShopifyViaApi(base);
    if (viaApi) isShopify = true;
    else if (!homeHtml) isShopify = null;
    else if (homeHtml.length < 8000 && !detectShopify(homeHtml)) {
      // HTML curto / bot-wall — tenta API; se falhar, null (não marcar false)
      isShopify = viaApi ? true : null;
    }
  }

  let brandName: string | null = null;
  let htmlLang: string | null = null;
  let ogLocale: string | null = null;
  if (homeHtml) {
    const $ = cheerio.load(homeHtml);
    brandName =
      $('meta[property="og:site_name"]').attr("content")?.trim() ||
      $("title").first().text().trim().slice(0, 80) ||
      null;
    htmlLang =
      $("html").attr("lang")?.trim() ||
      $('meta[http-equiv="content-language"]').attr("content")?.trim() ||
      null;
    ogLocale =
      $('meta[property="og:locale"]').attr("content")?.trim() ||
      $('meta[property="og:locale:alternate"]').attr("content")?.trim() ||
      null;
  }

  const names = new Set<string>();
  const related = new Set<string>();
  let entityId: string | null = null;
  let sourcePath: string | null = null;

  for (const path of LEGAL_PATHS) {
    const html = await fetchText(`${base}${path}`);
    if (!html) continue;
    const text = cheerio.load(html)("body").text().replace(/\s+/g, " ");
    const extracted = extractLegalNames(text);
    if (extracted.length) {
      for (const n of extracted) names.add(n);
      if (!sourcePath) sourcePath = path;
    }
    for (const h of extractRelatedHosts(text, host)) related.add(h);
    const eid = text.match(ENTITY_ID_RE)?.[1];
    if (eid && !entityId) entityId = eid;
    if (names.size >= 1 && entityId) break;
  }

  if (homeHtml) {
    const text = cheerio.load(homeHtml)("body").text().replace(/\s+/g, " ");
    if (names.size === 0) {
      for (const n of extractLegalNames(text)) names.add(n);
    }
    for (const h of extractRelatedHosts(text, host)) related.add(h);
  }

  const country = countryFromStoreSignals({ host, htmlLang, ogLocale });

  return {
    host,
    ok: Boolean(homeHtml) || names.size > 0,
    isShopify,
    legalNames: [...names],
    relatedHosts: [...related],
    entityId,
    brandName,
    sourcePath,
    country,
    htmlLang,
    error: homeHtml || names.size ? undefined : "Host inacessível",
  };
}
