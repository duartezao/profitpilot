import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of raw.split(/\r?\n/)) {
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

const { connectToDatabase } = await import("@/lib/db");
const { Store } = await import("@/models/Store");
const { repairEditedOrderRevenueForStore } = await import(
  "@/lib/order-backfill"
);
const { invalidateWorkspaceMetricsCache } = await import(
  "@/lib/metrics-summary-cache"
);

await connectToDatabase();
const stores = await Store.find({ deletedAt: null }).select("_id name workspaceId").lean();
let total = 0;
for (const s of stores) {
  const n = await repairEditedOrderRevenueForStore(s._id);
  if (n > 0) {
    console.log(`${s.name}: corrigidas ${n} encomendas`);
    total += n;
    invalidateWorkspaceMetricsCache(String(s.workspaceId));
  }
}
console.log(`Total corrigido: ${total}`);
process.exit(0);
