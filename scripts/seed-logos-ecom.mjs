/**
 * Seed LOGOS ECOM LLC + lojas Shopify conhecidas (sem RPC Google / sem flag IP).
 * Uso: node scripts/seed-logos-ecom.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mongoose from "mongoose";

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

/** Lojas da rede LOGOS (exclui as tuas: marie-bruxelles.com, friedamuenchen.com, etc.). */
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

const TLD_COUNTRY = {
  it: "IT",
  es: "ES",
  de: "DE",
  at: "AT",
  ch: "CH",
  nl: "NL",
  fr: "FR",
  com: null,
  uk: "GB",
};

function countryFromHost(host) {
  const tld = host.split(".").pop();
  return TLD_COUNTRY[tld] ?? (tld?.length === 2 ? tld.toUpperCase() : null);
}

async function isShopify(host) {
  try {
    const res = await fetch(`https://${host}`, {
      signal: AbortSignal.timeout(14000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok && res.status >= 500) return false;
    const html = await res.text();
    return (
      html.includes("cdn.shopify.com") ||
      html.includes("Shopify.theme") ||
      html.includes("myshopify.com") ||
      html.includes("shopify-section")
    );
  } catch {
    return false;
  }
}

loadEnv();
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const sample = await db
  .collection("competitorcompanies")
  .findOne({ deletedAt: null });
if (!sample?.workspaceId) {
  console.error("Sem workspace.");
  process.exit(1);
}
const workspaceId = sample.workspaceId;
const legal = "LOGOS ECOM LLC";

let company = await db.collection("competitorcompanies").findOne({
  workspaceId,
  legalNameKey: legal,
  deletedAt: null,
});
if (!company) {
  const r = await db.collection("competitorcompanies").insertOne({
    workspaceId,
    legalName: legal,
    legalNameKey: legal,
    seedHosts: SEED_HOSTS,
    countries: [],
    storeCount: 0,
    activeAdCount: 0,
    notes: "Advertiser AR04839296710767280129 · rede multi-loja",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
  company = { _id: r.insertedId, ...r };
  console.log("created", legal);
} else {
  await db.collection("competitorcompanies").updateOne(
    { _id: company._id },
    {
      $addToSet: { seedHosts: { $each: SEED_HOSTS } },
      $set: {
        notes: "Advertiser AR04839296710767280129 · rede multi-loja",
        deletedAt: null,
        updatedAt: new Date(),
      },
    },
  );
  console.log("updated", legal);
}

let added = 0;
let skipped = 0;
const countries = new Set();

for (const host of SEED_HOSTS) {
  process.stdout.write(`check ${host}… `);
  const ok = await isShopify(host);
  if (!ok) {
    console.log("não Shopify / inacessível");
    skipped++;
    continue;
  }
  const country = countryFromHost(host);
  if (country) countries.add(country);
  await db.collection("competitordomains").updateOne(
    { workspaceId, host },
    {
      $setOnInsert: {
        workspaceId,
        host,
        firstSeenAt: new Date(),
        discoverySource: "seed",
      },
      $set: {
        companyId: company._id,
        isShopify: true,
        isActive: true,
        lastSeenAt: new Date(),
        ...(country ? { country } : {}),
      },
      $unset: { deletedAt: "" },
    },
    { upsert: true },
  );
  console.log("OK Shopify");
  added++;
}

const domains = await db
  .collection("competitordomains")
  .find({ companyId: company._id, deletedAt: null, isShopify: true })
  .toArray();

await db.collection("competitorcompanies").updateOne(
  { _id: company._id },
  {
    $set: {
      storeCount: domains.length,
      countries: [...countries].sort(),
      updatedAt: new Date(),
    },
  },
);

console.log("\nLOGOS ECOM LLC");
console.log("lojas:", domains.length, domains.map((d) => d.host));
console.log("added/updated Shopify:", added, "skipped:", skipped);
console.log(
  "Transparency:",
  "https://adstransparency.google.com/advertiser/AR04839296710767280129?region=anywhere",
);
await mongoose.disconnect();
