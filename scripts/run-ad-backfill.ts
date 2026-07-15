/**
 * Backfill gasto + campanhas API (dias parciais / lacunas) — uma loja ou todas.
 * Uso:
 *   node --experimental-strip-types --import ./tests/resolve-alias.mjs scripts/run-ad-backfill.ts
 *   node ... scripts/run-ad-backfill.ts <storeId>
 *   node ... scripts/run-ad-backfill.ts --all
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const envPath = resolve(process.cwd(), name);
    try {
      const raw = readFileSync(envPath, "utf8");
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
      /* next */
    }
  }
}

loadEnv();

const arg = process.argv[2]?.trim() ?? "--all";
const allStores = arg === "--all";
const maxDays = Number(process.argv[3] ?? "45") || 45;

const mongoose = (await import("mongoose")).default;
const { Store } = await import("@/models/Store");
const { loadSyncAdAccountsForStore } = await import("@/lib/ad-accounts");
const { syncMissingAdMetricsForStore } = await import(
  "@/lib/ad-metrics-backfill"
);

const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  console.error("Falta MONGODB_URI.");
  process.exit(1);
}

await mongoose.connect(uri);

const stores = allStores
  ? await Store.find({ deletedAt: null, status: "active" })
      .select("_id name")
      .sort({ name: 1 })
      .lean()
  : await Store.find({ _id: arg, deletedAt: null })
      .select("_id name")
      .lean();

if (!stores.length) {
  console.error("Nenhuma loja encontrada.");
  process.exit(1);
}

console.log(
  `Backfill ads — ${stores.length} loja(s), maxDays=${maxDays}, force=true\n`,
);

let totalSynced = 0;
let totalSpendDays = 0;
let storesWithAds = 0;

for (const store of stores) {
  const accounts = await loadSyncAdAccountsForStore(store._id);
  if (!accounts.length) {
    console.log(`— ${store.name}: sem contas ads, ignorada`);
    continue;
  }

  storesWithAds++;
  const storeId = String(store._id);
  console.log(`→ ${store.name} (${storeId}) …`);

  try {
    const result = await syncMissingAdMetricsForStore(storeId, {
      force: true,
      maxDays,
    });
    totalSynced += result.synced;
    totalSpendDays += result.spendDays;
    console.log(
      `  OK: ${result.synced}/${result.checked} dias processados, ${result.spendDays} gastos actualizados`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ERRO: ${msg}`);
  }
}

console.log(
  `\nConcluído: ${storesWithAds} lojas com ads, ${totalSynced} dias sync, ${totalSpendDays} gastos actualizados.`,
);
await mongoose.disconnect();
