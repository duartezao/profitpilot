/**
 * 1) Limpa hosts com chars lixo (… _ zero-width)
 * 2) Soft-delete domínios CDN/infra
 * 3) Actualiza seeds LOGOS
 * 4) Preenche activeAdCount + snapshot por loja LOGOS (SerpAPI se key; senão RPC directo com delay)
 *
 * Uso: node scripts/refresh-logos-full.mjs
 * Depois: node scripts/expand-logos-network.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mongoose from "mongoose";

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

const SEED_HOSTS = [
  "duneeden.com",
  "elisa-roma.it",
  "sofia-barcelona.com",
  "lineabrava.es",
  "ameliewolf.com",
  "frieda-otto.com",
  "amoramoda.it",
  "miriam-london.com",
  "valeriamarbella.es",
  "aliciatropez.com",
  "sophiemelbourne.com",
  "shizukakaban.com",
  "emmageneve.ch",
  "lotte-amsterdam.nl",
  "camillemode.com",
  "veyra-moda.com",
  "garance-paris.fr",
];

const BLOCKED_HOST =
  /(^|\.)(google|googleapis|gstatic|googleusercontent|googletagmanager|doubleclick|googlesyndication|youtube|ytimg|facebook|fbcdn|instagram|cdninstagram|tiktok|github|w3\.org|shopify\.com|myshopify|cloudflare|fonts\.|example\.com)/i;

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getSerpKey() {
  return (
    process.env.SERPAPI_API_KEY?.trim() ||
    process.env.SERPAPI_KEY?.trim() ||
    ""
  );
}

async function serpAdsByDomain(host) {
  const key = getSerpKey();
  if (!key) return null;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_ads_transparency_center");
  url.searchParams.set("text", host);
  url.searchParams.set("num", "40");
  url.searchParams.set("api_key", key);
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
  const json = await res.json();
  if (json.error) return { activeAdCount: 0, advertisers: [], creatives: [], note: json.error };
  const rows = json.ad_creatives || [];
  const creatives = rows.slice(0, 40).map((r) => ({
    creativeId: r.ad_creative_id ?? null,
    advertiserId: r.advertiser_id ?? null,
    advertiserName: r.advertiser ?? null,
    advertiserVerified: false,
    format: r.format ?? null,
    previewUrl: null,
    landingUrl:
      typeof r.link === "string" &&
      r.link.startsWith("http") &&
      !/googleusercontent|content\.js|googlesyndication/i.test(r.link)
        ? r.link
        : null,
    displayDomain: r.target_domain ? normalizeHost(r.target_domain) : null,
    firstShown: r.first_shown ? String(r.first_shown) : null,
    lastShown: r.last_shown ? String(r.last_shown) : null,
    regions: [],
  }));
  const advertisers = [
    ...new Set(
      creatives
        .map((c) => c.advertiserName)
        .filter(Boolean)
        .map((n) => String(n).toUpperCase()),
    ),
  ];
  return {
    activeAdCount: json.search_information?.total_results ?? creatives.length,
    advertisers,
    creatives,
    note: `SerpAPI · ${creatives.length} creatives`,
  };
}

async function directAdsByDomain(host) {
  const RPC = "https://adstransparency.google.com/anji/_/rpc";
  const payload = {
    "2": 40,
    "3": { "12": { "1": host, "2": true }, "3": { "1": 1 } },
  };
  const res = await fetch(`${RPC}/SearchService/SearchCreatives?authuser=`, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "*/*",
      Origin: "https://adstransparency.google.com",
      Referer: "https://adstransparency.google.com/?region=anywhere",
    },
    body: `f.req=${encodeURIComponent(JSON.stringify(payload))}`,
    signal: AbortSignal.timeout(25000),
  });
  const text = await res.text();
  if (
    res.status === 429 ||
    /\/sorry\//i.test(res.url) ||
    /unusual traffic|captcha/i.test(text.slice(0, 500)) ||
    text.startsWith("<!") ||
    text.startsWith("<html")
  ) {
    return { blocked: true, activeAdCount: 0, advertisers: [], creatives: [], note: `blocked http_${res.status}` };
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { activeAdCount: 0, advertisers: [], creatives: [], note: "parse_fail" };
  }
  const rows = json?.["1"];
  if (!Array.isArray(rows)) {
    return { activeAdCount: 0, advertisers: [], creatives: [], note: "Sem creatives" };
  }
  const advertisers = new Set();
  const creatives = [];
  for (const raw of rows.slice(0, 40)) {
    if (!raw || typeof raw !== "object") continue;
    const name = typeof raw["12"] === "string" ? raw["12"] : null;
    if (name) advertisers.add(name.toUpperCase());
    const displayDomain =
      typeof raw["14"] === "string" ? normalizeHost(raw["14"]) : null;
    creatives.push({
      creativeId: typeof raw["2"] === "string" ? raw["2"] : null,
      advertiserId: typeof raw["1"] === "string" ? raw["1"] : null,
      advertiserName: name,
      advertiserVerified: false,
      format: null,
      previewUrl: null,
      landingUrl: null,
      displayDomain,
      firstShown: null,
      lastShown: null,
      regions: [],
    });
  }
  return {
    activeAdCount: creatives.length,
    advertisers: [...advertisers],
    creatives,
    note: `RPC directo · ${creatives.length} creatives`,
  };
}

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const now = new Date();

const logos = await db
  .collection("competitorcompanies")
  .findOne({ legalNameKey: "LOGOS ECOM LLC", deletedAt: null });
if (!logos) {
  console.error("LOGOS ECOM LLC não encontrada");
  process.exit(1);
}
const workspaceId = logos.workspaceId;

// 1) Sanitizar hosts
const allDomains = await db
  .collection("competitordomains")
  .find({ workspaceId })
  .toArray();
let renamed = 0;
let softDeleted = 0;
for (const d of allDomains) {
  const clean = normalizeHost(d.host);
  if (!clean || BLOCKED_HOST.test(clean) || !clean.includes(".")) {
    if (!d.deletedAt) {
      await db
        .collection("competitordomains")
        .updateOne({ _id: d._id }, { $set: { deletedAt: now, isActive: false } });
      softDeleted++;
      console.log("soft-delete junk", d.host);
    }
    continue;
  }
  if (clean !== d.host) {
    const clash = await db.collection("competitordomains").findOne({
      workspaceId,
      host: clean,
      _id: { $ne: d._id },
      deletedAt: null,
    });
    if (clash) {
      await db
        .collection("competitordomains")
        .updateOne({ _id: d._id }, { $set: { deletedAt: now, isActive: false } });
      softDeleted++;
      console.log("soft-delete duplicate dirty", JSON.stringify(d.host), "→", clean);
    } else {
      await db
        .collection("competitordomains")
        .updateOne({ _id: d._id }, { $set: { host: clean } });
      renamed++;
      console.log("renamed", JSON.stringify(d.host), "→", clean);
    }
  }
}
console.log(`sanitize: renamed=${renamed} softDeleted=${softDeleted}`);

// 2) Seeds limpos
await db.collection("competitorcompanies").updateOne(
  { _id: logos._id },
  { $set: { seedHosts: SEED_HOSTS } },
);
console.log("seeds actualizados", SEED_HOSTS.length);

// 3) Ads por loja LOGOS activa Shopify
const logosDomains = await db
  .collection("competitordomains")
  .find({
    companyId: logos._id,
    deletedAt: null,
    isShopify: true,
  })
  .toArray();

const useSerp = Boolean(getSerpKey());
console.log(
  `Ads para ${logosDomains.length} lojas via ${useSerp ? "SerpAPI" : "RPC directo (risco IP)"}`,
);

let blocked = false;
for (const d of logosDomains) {
  const host = normalizeHost(d.host);
  process.stdout.write(`${host} ... `);
  let result;
  if (useSerp) {
    result = await serpAdsByDomain(host);
    if (!result) result = { activeAdCount: 0, advertisers: [], creatives: [], note: "serp_null" };
  } else {
    if (blocked) {
      console.log("skip (blocked)");
      continue;
    }
    result = await directAdsByDomain(host);
    if (result.blocked) {
      blocked = true;
      console.log("BLOCKED — para para não flaggar IP");
      continue;
    }
    await sleep(2500);
  }

  await db.collection("competitoradsnapshots").updateOne(
    { workspaceId, domainId: d._id, dateKey: todayKey() },
    {
      $set: {
        workspaceId,
        domainId: d._id,
        host,
        dateKey: todayKey(),
        advertiserName: result.advertisers[0] ?? null,
        advertiserVerified: false,
        activeAdCount: result.activeAdCount,
        creatives: result.creatives,
        rawNote: result.note,
      },
    },
    { upsert: true },
  );
  await db.collection("competitordomains").updateOne(
    { _id: d._id },
    {
      $set: {
        host,
        activeAdCount: result.activeAdCount,
        advertisers: result.advertisers,
        lastScannedAt: now,
      },
    },
  );
  console.log(`${result.activeAdCount} ads · ${result.note}`);
}

const refreshed = await db
  .collection("competitordomains")
  .find({ companyId: logos._id, deletedAt: null })
  .project({ host: 1, activeAdCount: 1 })
  .toArray();
const totalAds = refreshed.reduce((s, d) => s + (d.activeAdCount || 0), 0);
await db.collection("competitorcompanies").updateOne(
  { _id: logos._id },
  {
    $set: {
      storeCount: refreshed.length,
      activeAdCount: totalAds,
      lastScannedAt: now,
    },
  },
);

console.log(
  "\nLOGOS",
  refreshed.length,
  "lojas ·",
  totalAds,
  "ads",
  refreshed.map((d) => `${d.host}:${d.activeAdCount || 0}`).join(", "),
);
await mongoose.disconnect();
