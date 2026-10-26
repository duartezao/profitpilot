/**
 * Soft-delete domains que não são lojas Shopify + empresas lixo.
 * Uso: node scripts/purge-competitor-junk.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mongoose from "mongoose";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 0) continue;
        const key = t.slice(0, i).trim();
        let val = t.slice(i + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    } catch {
      /* missing file */
    }
  }
}

loadEnv();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI não configurado no .env");
  process.exit(1);
}

const BLOCKED_HOST_RE =
  /(^|\.)(google|googleapis|gstatic|googleusercontent|googletagmanager|doubleclick|googlesyndication|googleadservices|youtube|ytimg|facebook|fbcdn|instagram|cdninstagram|meta\.com|twitter|x\.com|t\.co|tiktok|bytedance|linkedin|microsoft|office|live\.com|azure|cloudflare|fastly|akamai|amazonaws|cloudfront|jsdelivr|unpkg|npmjs|github|githubusercontent|gitlab|bitbucket|w3\.org|example\.com|example\.org|localhost|shopify\.com|myshopify\.com|shopifycdn|klaviyo|hotjar|segment\.com|sentry|clarity\.ms|bing\.com|yahoo\.com|apple\.com|vimeo|pinterest|reddit|whatsapp|telegram|fonts\.)/i;

const NOISE_LEGAL_RE =
  /\b(GOOGLE|META\s+PLATFORMS|FACEBOOK|SHOPIFY|COPYRIGHT|SPHERITY)\b|^LLC$|^LIMITED$/i;

function isJunkHost(host) {
  const h = String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (!h || !h.includes(".")) return true;
  if (h === "example.com" || h.endsWith(".example.com")) return true;
  return BLOCKED_HOST_RE.test(h);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const domains = db.collection("competitordomains");
  const companies = db.collection("competitorcompanies");
  const now = new Date();

  const active = await domains.find({ deletedAt: null }).toArray();
  const junkIds = [];
  const keep = [];
  for (const d of active) {
    const shopifyOk = d.isShopify === true && !isJunkHost(d.host);
    if (shopifyOk) {
      keep.push(d.host);
      continue;
    }
    junkIds.push(d._id);
    console.log(`  − ${d.host} (isShopify=${d.isShopify})`);
  }

  let removedDomains = 0;
  if (junkIds.length) {
    const r = await domains.updateMany(
      { _id: { $in: junkIds } },
      {
        $set: {
          deletedAt: now,
          isShopify: false,
          isActive: false,
        },
      },
    );
    removedDomains = r.modifiedCount;
  }

  const activeCompanies = await companies.find({ deletedAt: null }).toArray();
  const junkCompanyIds = [];
  for (const c of activeCompanies) {
    if (!NOISE_LEGAL_RE.test(String(c.legalName ?? ""))) continue;
    junkCompanyIds.push(c._id);
    console.log(`  − empresa «${c.legalName}»`);
  }

  let removedCompanies = 0;
  if (junkCompanyIds.length) {
    const r = await companies.updateMany(
      { _id: { $in: junkCompanyIds } },
      { $set: { deletedAt: now } },
    );
    removedCompanies = r.modifiedCount;
  }

  console.log(
    `\nOK: −${removedDomains} domains lixo, −${removedCompanies} empresas. Mantidas ${keep.length} lojas Shopify.`,
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
