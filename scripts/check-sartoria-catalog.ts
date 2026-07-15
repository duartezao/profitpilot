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

const mongoose = (await import("mongoose")).default;
await mongoose.connect(process.env.MONGODB_URI!);

const { Store } = await import("@/models/Store");
const { ProductCatalog } = await import("@/models/ProductCatalog");

const stores = await Store.find({ deletedAt: null, name: /sartoria/i })
  .select("name _id")
  .lean();
console.log("Lojas:", stores.map((s) => ({ id: String(s._id), name: s.name })));

for (const store of stores) {
  const sid = store._id;
  const total = await ProductCatalog.countDocuments({ storeId: sid });
  const globalPrimary = await ProductCatalog.countDocuments({
    storeId: sid,
    primaryCollectionHandle: /^global$/i,
  });
  const globalInList = await ProductCatalog.countDocuments({
    storeId: sid,
    "collections.handle": /^global$/i,
  });
  console.log(`\n${store.name}: ${total} produtos no catálogo`);
  console.log(`  primary=global: ${globalPrimary}, global na lista: ${globalInList}`);

  const samples = await ProductCatalog.find({
    storeId: sid,
    $or: [
      { primaryCollectionHandle: /^global$/i },
      { "collections.handle": /^global$/i },
    ],
  })
    .select("title primaryCollectionTitle primaryCollectionHandle collections")
    .limit(8)
    .lean();
  for (const s of samples) {
    console.log(
      `  - ${s.title} → primary: ${s.primaryCollectionTitle} (${s.primaryCollectionHandle}) | all: ${(s.collections ?? []).map((c) => c.handle).join(", ")}`,
    );
  }

  const all = await ProductCatalog.find({ storeId: sid })
    .select("title primaryCollectionTitle primaryCollectionHandle collections")
    .lean();
  if (all.length && !samples.length) {
    console.log("  Todos os produtos:");
    for (const s of all) {
      console.log(
        `  - ${s.title} → primary: ${s.primaryCollectionTitle} (${s.primaryCollectionHandle}) | all: ${(s.collections ?? []).map((c) => c.handle).join(", ")}`,
      );
    }
  }
}

await mongoose.disconnect();
