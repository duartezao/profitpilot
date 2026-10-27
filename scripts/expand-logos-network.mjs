/**
 * Parte das lojas seed da LOGOS ECOM LLC:
 * 1) confirma Shopify + extrai empresa operadora (Impressum/privacy)
 * 2) cria/liga empresas no mapa
 * 3) descobre hosts irmãos e repete (profundidade 2)
 *
 * Não chama Google Transparency (sem flag IP).
 * Uso: node scripts/expand-logos-network.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import http from "node:http";
import https from "node:https";
import mongoose from "mongoose";
import * as cheerio from "cheerio";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(process.cwd(), name), "utf8").split(
        "\n",
      )) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 0) continue;
        const key = t.slice(0, i).trim();
        let val = t.slice(i + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        )
          val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    } catch {
      /* */
    }
  }
}

const LEGAL_PATHS = [
  "/pages/impressum",
  "/pages/company-information",
  "/pages/legal-notice",
  "/pages/privacy-policy",
  "/pages/datenschutz",
  "/pages/informativa-sulla-privacy",
  "/pages/aviso-legal",
  "/policies/privacy-policy",
  "/policies/legal-notice",
  "/impressum",
  "/privacy-policy",
];

const OPERATED_RE =
  /(?:Operated by|Business operated by|managed by|advertising services are managed by|data processing and advertising services are managed by|Nombre de la empresa|Handelsname der|trade name of|Betrieben von)\s*[:\s]*([A-Za-z0-9&.'\- ]{3,80}?(?:LLC|L\.L\.C\.|Limited|Ltd\.?|Inc\.?|GmbH))/gi;

const LEGAL_NAME_RE =
  /\b([A-Z][A-Za-z0-9&.'\-]{1,40}(?:\s+[A-Z][A-Za-z0-9&.'\-]{1,40}){0,3}\s(?:LLC|L\.L\.C\.|Limited|Ltd\.?|Inc\.?|GmbH))\b/g;

const HOST_RE =
  /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|shop|store|at|de|ch|hu|nl|be|fr|it|es|pt|pl|se|dk|no|fi|ie|uk|co\.uk|com\.au))\b/gi;

const NOISE =
  /\b(ADDRESS|REGISTERED|WYOMING|CASPER|TRADEMARK|RABATT|VERSAND|VIEW\s*ALL|PRODUCTS|INFORMATION|MEDIENG|MODEHAUS|HANDELSNAME|GOOGLE|FACEBOOK|INSTAGRAM|SOFORT|ANALYTICS|GDPR|SCHEMA|CLOUDFLARE|MICROSOFT|APPLE|AMAZON|TIKTOK|KLAVIYO|SHOPIFY|META)\b/i;

const BLOCKED_HOST =
  /(google|gstatic|facebook|instagram|shopify\.com|myshopify|cdn\.|amazonaws|w3\.org|schema\.org|example\.com|sofort|paypal|stripe|klarna|apple\.com|microsoft|cloudflare|tiktok|hotjar|klaviyo|doubleclick)/i;

function normalizeLegal(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]+$/g, "")
    .toUpperCase();
}

function isNoiseLegal(name) {
  const key = normalizeLegal(name);
  if (key.length < 5 || key.length > 60) return true;
  if (!/\b(LLC|INC|GMBH|LTD|LIMITED)$/i.test(key)) return true;
  if (key.split(/\s+/).length > 5) return true;
  if (NOISE.test(key)) return true;
  if (/^ECOM\s+LLC$/i.test(key)) return true;
  return false;
}

function extractCanonical(raw) {
  const key = normalizeLegal(raw);
  const matches = [
    ...key.matchAll(/\b(LLC|L\.L\.C\.|LIMITED|LTD\.?|INC\.?|GMBH)\b/g),
  ];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  const before = key.slice(0, last.index).trim().split(/\s+/).filter(Boolean);
  let best = null;
  for (let n = 1; n <= 3; n++) {
    if (before.length < n) break;
    const part = before.slice(-n).join(" ");
    if (/^(OF|DER|THE|A|AN|AND|UND|NAME|TRADE|FOR|BY)$/.test(part.split(/\s+/).pop()))
      continue;
    const cand = normalizeLegal(`${part} ${last[0]}`);
    if (!isNoiseLegal(cand)) best = cand;
  }
  return best;
}

function normalizeHost(input) {
  let s = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[\u2026\u2025\u22ef\u00b7\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  s = s.replace(/[._]+$/g, "").replace(/[^a-z0-9.-]/g, "");
  return s.replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");
}

function countryFromLang(langInput) {
  if (!langInput) return null;
  const raw = String(langInput).trim().replace(/_/g, "-").toLowerCase();
  const [lang, region] = raw.split("-");
  const map = {
    de: "DE",
    at: "AT",
    ch: "CH",
    nl: "NL",
    be: "BE",
    fr: "FR",
    it: "IT",
    es: "ES",
    pt: "PT",
    pl: "PL",
    sv: "SE",
    da: "DK",
    no: "NO",
    fi: "FI",
    hu: "HU",
    cs: "CZ",
    en: null,
    us: "US",
    gb: "GB",
    au: "AU",
  };
  if (region && /^[a-z]{2}$/.test(region)) {
    return map[region] ?? region.toUpperCase();
  }
  return map[lang] ?? null;
}

function countryFromHost(host) {
  const tld = host.split(".").pop();
  const map = {
    de: "DE",
    at: "AT",
    ch: "CH",
    it: "IT",
    es: "ES",
    fr: "FR",
    nl: "NL",
    be: "BE",
    pt: "PT",
    uk: "GB",
  };
  return map[tld] ?? null;
}

function fetchText(url, redirects = 0) {
  if (redirects > 5) return Promise.resolve(null);
  return new Promise((resolvePromise) => {
    const lib = url.startsWith("http:") ? http : https;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
        timeout: 18000,
        rejectUnauthorized: false,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          void fetchText(next, redirects + 1).then(resolvePromise);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          resolvePromise(null);
          return;
        }
        res.setEncoding("utf8");
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolvePromise(body || null));
      },
    );
    req.on("error", () => resolvePromise(null));
    req.on("timeout", () => {
      req.destroy();
      resolvePromise(null);
    });
  });
}

function detectShopify(html) {
  return (
    html.includes("cdn.shopify.com") ||
    html.includes("Shopify.theme") ||
    html.includes("Shopify.shop") ||
    html.includes("myshopify.com") ||
    html.includes("shopify-section")
  );
}

async function detectShopifyViaApi(base) {
  for (const path of ["/products.json", "/meta.json", "/cart.js"]) {
    const body = await fetchText(`${base}${path}`);
    if (!body) continue;
    if (path === "/products.json" && /"products"\s*:/.test(body)) return true;
    if (path === "/meta.json" && /myshopify|shopify/i.test(body)) return true;
    if (path === "/cart.js" && /"token"\s*:/.test(body)) return true;
  }
  return false;
}

/** Variantes sem hífen (sophie-melbourne.com → sophiemelbourne.com). */
function hostVariants(host) {
  const h = normalizeHost(host);
  const out = [h];
  if (h.includes("-")) {
    const compact = h.replace(/-/g, "");
    if (compact !== h) out.push(compact);
  }
  return out;
}

async function crawlHost(hostInput) {
  let host = normalizeHost(hostInput);
  let home = null;
  let base = `https://${host}`;

  for (const candidate of hostVariants(host)) {
    base = `https://${candidate}`;
    home = await fetchText(base);
    if (!home) home = await fetchText(`http://${candidate}`);
    const okHtml = home && (detectShopify(home) || home.length > 8000);
    const okApi = await detectShopifyViaApi(base);
    if (okHtml || okApi) {
      host = candidate;
      break;
    }
    if (home && detectShopify(home)) {
      host = candidate;
      break;
    }
  }

  let isShopify = home ? detectShopify(home) : null;
  if (isShopify !== true) {
    const viaApi = await detectShopifyViaApi(base);
    if (viaApi) isShopify = true;
    else if (!home || (home.length < 8000 && !detectShopify(home))) isShopify = null;
  }
  const names = new Set();
  const related = new Set();

  for (const path of LEGAL_PATHS) {
    const html = await fetchText(`${base}${path}`);
    if (!html) continue;
    const text = cheerio.load(html)("body").text().replace(/\s+/g, " ");
    for (const m of text.matchAll(OPERATED_RE)) {
      const c = extractCanonical(m[1] ?? "");
      if (c) names.add(c);
    }
    for (const m of text.matchAll(LEGAL_NAME_RE)) {
      const c = extractCanonical(m[1] ?? "");
      if (c) names.add(c);
    }
    for (const m of text.matchAll(HOST_RE)) {
      const h = normalizeHost(m[1] ?? "");
      if (h && h !== host && !BLOCKED_HOST.test(h) && h.includes(".")) {
        related.add(h);
      }
    }
    if (names.size > 0) break;
  }

  if (home && names.size === 0) {
    const text = cheerio.load(home)("body").text().replace(/\s+/g, " ");
    for (const m of text.matchAll(OPERATED_RE)) {
      const c = extractCanonical(m[1] ?? "");
      if (c) names.add(c);
    }
  }

  let htmlLang = null;
  let ogLocale = null;
  if (home) {
    const $ = cheerio.load(home);
    htmlLang = $("html").attr("lang")?.trim() || null;
    ogLocale = $('meta[property="og:locale"]').attr("content")?.trim() || null;
  }
  const country =
    countryFromLang(ogLocale) ||
    countryFromLang(htmlLang) ||
    countryFromHost(host);

  return {
    host,
    isShopify,
    legalNames: [...names],
    relatedHosts: [...related],
    country,
    htmlLang,
  };
}

loadEnv();
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const sample = await db.collection("competitorcompanies").findOne({
  deletedAt: null,
});
const workspaceId = sample.workspaceId;

const own = await db
  .collection("stores")
  .find({ deletedAt: null })
  .project({ displayUrl: 1 })
  .toArray();
const ownHosts = new Set(
  own.map((s) => String(s.displayUrl || "").toLowerCase()).filter(Boolean),
);

let logos = await db.collection("competitorcompanies").findOne({
  workspaceId,
  legalNameKey: "LOGOS ECOM LLC",
  deletedAt: null,
});
if (!logos) {
  console.error("LOGOS ECOM LLC não existe — corre seed-logos-ecom.mjs primeiro");
  process.exit(1);
}

const companyCache = new Map([["LOGOS ECOM LLC", logos._id]]);

async function ensureCo(legal) {
  const key = normalizeLegal(legal);
  if (companyCache.has(key)) return companyCache.get(key);
  if (isNoiseLegal(key)) return null;
  let doc = await db.collection("competitorcompanies").findOne({
    workspaceId,
    legalNameKey: key,
    deletedAt: null,
  });
  if (!doc) {
    const r = await db.collection("competitorcompanies").insertOne({
      workspaceId,
      legalName: key,
      legalNameKey: key,
      seedHosts: [],
      countries: [],
      storeCount: 0,
      activeAdCount: 0,
      notes: "via expand-logos-network",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    doc = { _id: r.insertedId };
    console.log("  + empresa", key);
  }
  companyCache.set(key, doc._id);
  return doc._id;
}

async function upsertDomain(host, companyId, source, countryHint = null) {
  if (ownHosts.has(host)) return null;
  if (BLOCKED_HOST.test(host)) return null;
  const country = countryHint || countryFromHost(host);
  await db.collection("competitordomains").updateOne(
    { workspaceId, host },
    {
      $setOnInsert: {
        workspaceId,
        host,
        firstSeenAt: new Date(),
        discoverySource: source,
      },
      $set: {
        companyId,
        isShopify: true,
        isActive: true,
        lastSeenAt: new Date(),
        ...(country ? { country } : {}),
      },
      $unset: { deletedAt: "" },
    },
    { upsert: true },
  );
  const d = await db.collection("competitordomains").findOne({ workspaceId, host });
  if (d) {
    await db.collection("competitorlinks").updateOne(
      {
        workspaceId,
        fromType: "company",
        fromId: companyId,
        toType: "domain",
        toId: d._id,
        kind: source === "seed" ? "seed" : "same_legal",
      },
      {
        $setOnInsert: {
          workspaceId,
          fromType: "company",
          fromId: companyId,
          toType: "domain",
          toId: d._id,
          kind: source === "seed" ? "seed" : "same_legal",
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
  return d;
}

const seeds = (logos.seedHosts || []).filter((h) => !ownHosts.has(h));
const queue = seeds.map((h) => ({ host: h, depth: 0, companyId: logos._id }));
const seen = new Set();
const MAX_DEPTH = 4;
let scanned = 0;
let linked = 0;

console.log("LOGOS seeds:", seeds.length, "(sem limite de lojas irmãs)");

while (queue.length) {
  const item = queue.shift();
  const host = normalizeHost(item.host);
  if (!host || seen.has(host) || ownHosts.has(host)) continue;
  seen.add(host);
  scanned++;
  process.stdout.write(`[${scanned}] ${host} ... `);

  const info = await crawlHost(host);
  if (info.isShopify !== true) {
    console.log(info.isShopify === false ? "não Shopify" : "inacessível");
    continue;
  }
  console.log(
    "Shopify ·",
    info.country ?? "—",
    "·",
    info.htmlLang ?? "lang?",
    "·",
    info.legalNames.join(" | ") || "sem legal",
  );

  let companyId = item.companyId;
  for (const legal of info.legalNames) {
    const id = await ensureCo(legal);
    if (!id) continue;
    companyId = id;
  }
  if (info.legalNames.includes("LOGOS ECOM LLC")) {
    companyId = logos._id;
  }

  await upsertDomain(
    host,
    companyId,
    item.depth === 0 ? "seed" : "impressum",
    info.country,
  );
  linked++;

  if (item.depth >= MAX_DEPTH) continue;
  for (const rel of info.relatedHosts) {
    if (seen.has(rel) || ownHosts.has(rel)) continue;
    queue.push({
      host: rel,
      depth: item.depth + 1,
      companyId,
    });
  }
}

// Refresh aggregates
const cos = await db
  .collection("competitorcompanies")
  .find({ workspaceId, deletedAt: null })
  .toArray();
for (const c of cos) {
  const domains = await db
    .collection("competitordomains")
    .find({ companyId: c._id, deletedAt: null, isShopify: true })
    .toArray();
  const countries = [
    ...new Set(domains.map((d) => d.country).filter(Boolean)),
  ].sort();
  await db.collection("competitorcompanies").updateOne(
    { _id: c._id },
    {
      $set: {
        storeCount: domains.length,
        activeAdCount: domains.reduce((s, d) => s + (d.activeAdCount || 0), 0),
        countries,
        updatedAt: new Date(),
      },
    },
  );
  if (domains.length) {
    console.log(
      c.legalName,
      "→",
      domains.length,
      "lojas:",
      domains.map((d) => d.host).join(", "),
    );
  }
}

console.log("\nDone. scanned", scanned, "linked Shopify", linked);
await mongoose.disconnect();
