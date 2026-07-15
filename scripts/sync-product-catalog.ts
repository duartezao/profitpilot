/**
 * Força sync de coleções Shopify (ProductCatalog) para variantes vendidas.
 * Uso: node --experimental-strip-types --import ./tests/resolve-alias.mjs scripts/sync-product-catalog.ts [storeId]
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

const storeId = process.argv[2];
if (!storeId) {
  console.error("Indica o storeId: scripts/sync-product-catalog.ts <storeId>");
  process.exit(1);
}

const { Store } = await import("@/models/Store");
const { ProductCatalog } = await import("@/models/ProductCatalog");
const { decrypt } = await import("@/lib/crypto");
const {
  getClientCredentialsToken,
  normalizeShopDomain,
} = await import("@/lib/shopify");
const { syncAllSoldProductCatalog } = await import("@/lib/shopify-sync");

const mongoose = (await import("mongoose")).default;
await mongoose.connect(process.env.MONGODB_URI!);

const store = await Store.findById(storeId).lean();
if (!store?.credentials || !store.shopDomain) {
  console.error("Loja inválida");
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

const before = await ProductCatalog.countDocuments({ storeId: store._id });
console.log(`Loja: ${store.name} (${storeId})`);
console.log(`ProductCatalog antes: ${before}`);

const result = await syncAllSoldProductCatalog(store, domain, accessToken);
const after = await ProductCatalog.countDocuments({ storeId: store._id });
const withCollection = await ProductCatalog.countDocuments({
  storeId: store._id,
  primaryCollectionId: { $ne: null },
});

console.log(`Produtos actualizados nesta corrida: ${result.count}`);
console.log(`ProductCatalog depois: ${after} (${withCollection} com coleção principal)`);

await mongoose.disconnect();
