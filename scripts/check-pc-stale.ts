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
const m = (await import("mongoose")).default;
await m.connect(process.env.MONGODB_URI!);
const { ProductCost } = await import("@/models/ProductCost");
const { CogsHistory } = await import("@/models/CogsHistory");
const { Store } = await import("@/models/Store");
const store = await Store.findById("6a2f3c90f28d6fea7e49ddf3")
  .select("catalogRefreshOffset")
  .lean();
console.log("catalogRefreshOffset:", store?.catalogRefreshOffset ?? 0);
const ids = [
  "57848425283919",
  "57848276091215",
  "57848925159759",
];
for (const id of ids) {
  const gid = `gid://shopify/ProductVariant/${id}`;
  const pc = await ProductCost.findOne({ variantId: gid })
    .select("unitCost updatedAt title")
    .lean();
  const hist = await CogsHistory.find({ variantId: gid })
    .sort({ effectiveFrom: -1 })
    .limit(2)
    .lean();
  console.log("\n", pc?.title?.slice(0, 45));
  console.log("  BD unitCost:", pc?.unitCost, "| updated:", pc?.updatedAt?.toISOString()?.slice(0, 16));
  console.log(
    "  history:",
    hist.map((h) => `${h.unitCost} @ ${h.effectiveFrom?.toISOString()?.slice(0, 10)}`).join(" | ") || "none",
  );
}
await m.disconnect();
