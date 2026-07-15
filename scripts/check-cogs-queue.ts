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
const { listVariantIdsNeedingCostSync, countDistinctSoldVariants } =
  await import("@/lib/cogs");
const storeOid = new m.Types.ObjectId("6a2f3c90f28d6fea7e49ddf3");
const needing = await listVariantIdsNeedingCostSync(storeOid, 500);
const totalSold = await countDistinctSoldVariants(storeOid);
const sylvie = "gid://shopify/ProductVariant/57848425283919";
console.log("Variantes vendidas distintas:", totalSold);
console.log("Precisam sync custo (unitCost=0):", needing.length);
console.log("Sylvie na fila?", needing.includes(sylvie));
console.log("Posição Sylvie:", needing.indexOf(sylvie));
console.log("Primeiras 5:", needing.slice(0, 5).map((id) => id.slice(-8)));
console.log("Todas:", needing.map((id) => id.slice(-8)).join(", "));
await m.disconnect();
