import "server-only";
import * as cheerio from "cheerio";
import {
  isNoiseLegalName,
  normalizeHost,
  normalizeLegalName,
} from "./normalize";

const LEGAL_PATHS = [
  "/pages/impressum",
  "/pages/company-information",
  "/pages/legal-notice",
  "/pages/legal",
  "/pages/privacy-policy",
  "/pages/datenschutz",
  "/pages/politique-de-confidentialite",
  "/impressum",
  "/privacy",
  "/privacy-policy",
];

const LEGAL_NAME_RE =
  /\b([A-Z][A-Za-z0-9&.'\- ]{1,80}\s(?:LLC|L\.L\.C\.|Limited|Ltd\.?|Inc\.?|GmbH|S\.?A\.?|S\.?L\.?|BV|B\.V\.|SAS|SARL|Oy|AB|Pty Ltd))\b/g;

const ENTITY_ID_RE = /(?:Wyoming\s+)?Entity\s+ID[:\s#]*([0-9\-]+)/i;
const OPERATED_RE =
  /(?:Operated by|Betrieben von|Üzemeltető|Handelsmarke der|trade name of|Handelsname der)\s*[:\s]*([^\n.<]{3,100})/gi;

export type ImpressumResult = {
  host: string;
  ok: boolean;
  isShopify: boolean | null;
  legalNames: string[];
  entityId: string | null;
  brandName: string | null;
  sourcePath: string | null;
  error?: string;
};

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "ProfitPilotCompetitorMap/1.0 (+internal research; Mozilla/5.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text") && !ct.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractLegalNames(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(OPERATED_RE)) {
    const raw = (m[1] ?? "").trim();
    if (raw.length >= 3) found.add(normalizeLegalName(raw.split(/[\n|]/)[0]!));
  }
  for (const m of text.matchAll(LEGAL_NAME_RE)) {
    const raw = (m[1] ?? "").trim();
    if (raw.length >= 5) found.add(normalizeLegalName(raw));
  }
  return [...found].filter((n) => n.length <= 120 && !isNoiseLegalName(n));
}

function detectShopify(html: string): boolean {
  return (
    html.includes("cdn.shopify.com") ||
    html.includes("Shopify.theme") ||
    html.includes("myshopify.com")
  );
}

export async function crawlImpressum(hostInput: string): Promise<ImpressumResult> {
  const host = normalizeHost(hostInput);
  const base = `https://${host}`;
  let homeHtml = await fetchText(base);
  if (!homeHtml) {
    homeHtml = await fetchText(`http://${host}`);
  }
  const isShopify = homeHtml ? detectShopify(homeHtml) : null;

  let brandName: string | null = null;
  if (homeHtml) {
    const $ = cheerio.load(homeHtml);
    brandName =
      $('meta[property="og:site_name"]').attr("content")?.trim() ||
      $("title").first().text().trim().slice(0, 80) ||
      null;
  }

  const names = new Set<string>();
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
    const eid = text.match(ENTITY_ID_RE)?.[1];
    if (eid && !entityId) entityId = eid;
    if (names.size >= 1 && entityId) break;
  }

  if (homeHtml && names.size === 0) {
    const text = cheerio.load(homeHtml)("body").text().replace(/\s+/g, " ");
    for (const n of extractLegalNames(text)) names.add(n);
  }

  return {
    host,
    ok: Boolean(homeHtml) || names.size > 0,
    isShopify,
    legalNames: [...names],
    entityId,
    brandName,
    sourcePath,
    error: homeHtml || names.size ? undefined : "Host inacessível",
  };
}
