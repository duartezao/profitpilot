/**
 * Força sync de custos Shopify para variantes vendidas (modo shopify).
 * Uso: node --experimental-strip-types --import ./tests/resolve-alias.mjs scripts/sync-cogs-sold.ts [storeId] [maxPages]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
      return;
    } catch {
      /* */
    }
  }
}
loadEnv();

const storeId = process.argv[2] ?? "6a2f3c90f28d6fea7e49ddf3";
const maxPages = Number(process.argv[3] ?? "6") || 6;

const { Store } = await import("@/models/Store");
const { decrypt } = await import("@/lib/crypto");
const {
  getClientCredentialsToken,
  normalizeShopDomain,
} = await import("@/lib/shopify");
const { syncSoldProductCostsPage } = await import("@/lib/shopify-sync");
const { assimilatePendingCogsForStore } = await import("@/lib/cogs");
const { syncsShopifyProductCosts } = await import("@/lib/cogs-modes");

const mongoose = (await import("mongoose")).default;
await mongoose.connect(process.env.MONGODB_URI!);

const store = await Store.findById(storeId).lean();
if (!store?.credentials || !store.shopDomain) {
  console.error("Loja inválida");
  process.exit(1);
}
if (!syncsShopifyProductCosts(store.cogsMode)) {
  console.error("Loja não está em modo COGS shopify:", store.cogsMode);
  process.exit(1);
}

const creds = JSON.parse(decrypt(store.credentials)) as {
  clientId: string;
  clientSecret: string;
};
const domain = normalizeShopDomain(store.shopDomain);
const { accessToken } = await getClientCredentialsToken(
  domain,
  creds.clientId,
  creds.clientSecret,
);

let refreshOffset = store.catalogRefreshOffset ?? 0;
let totalChanged = 0;

for (let page = 0; page < maxPages; page++) {
  const result = await syncSoldProductCostsPage(store, domain, accessToken, {
    incremental: true,
    refreshOffset,
    deferAssimilate: page < maxPages - 1,
  });
  console.log(
    `Página ${page + 1}: mode=${result.mode} count=${result.count} changed=${result.changedVariantIds.length} hasMore=${result.hasMore}`,
  );
  totalChanged += result.changedVariantIds.length;
  refreshOffset = result.nextRefreshOffset;
  if (store._id && result.mode === "refresh") {
    await Store.updateOne(
      { _id: store._id },
      { $set: { catalogRefreshOffset: refreshOffset } },
    );
  }
  if (!result.hasMore && result.mode === "none") break;
}

await assimilatePendingCogsForStore(store._id);
console.log(`\nConcluído — ${totalChanged} variantes com custo actualizado.`);
await mongoose.disconnect();
