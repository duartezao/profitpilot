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
const { Store } = await import("@/models/Store");
const { ProductCost } = await import("@/models/ProductCost");
const { Order } = await import("@/models/Order");
const { countSoldVariantsMissingCost } = await import("@/lib/cogs");

await mongoose.connect(process.env.MONGODB_URI!);

const stores = await Store.find({ deletedAt: null, status: "active" })
  .select("_id name cogsMode lastSyncAt")
  .sort({ name: 1 })
  .lean();

console.log("=== COGS por loja ===\n");

for (const store of stores) {
  const storeId = store._id;
  const missing = await countSoldVariantsMissingCost([storeId]);
  const costs = await ProductCost.countDocuments({ storeId });
  const withCost = await ProductCost.countDocuments({
    storeId,
    $or: [{ unitCost: { $gt: 0 } }, { manualCost: { $gt: 0 } }],
  });

  const siblingExample = await ProductCost.aggregate([
    { $match: { storeId, productId: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: "$productId",
        variants: { $sum: 1 },
        withCost: {
          $sum: {
            $cond: [
              { $gt: [{ $ifNull: ["$unitCost", 0] }, 0] },
              1,
              0,
            ],
          },
        },
        maxCost: { $max: "$unitCost" },
      },
    },
    { $match: { variants: { $gt: 1 }, withCost: { $gt: 0, $lt: "$variants" } } },
    { $limit: 1 },
  ]);

  console.log(`${store.name}`);
  console.log(`  modo: ${store.cogsMode ?? "?"}`);
  console.log(`  última sync: ${store.lastSyncAt?.toISOString().slice(0, 16) ?? "—"}`);
  console.log(`  variantes em ProductCost: ${costs} (${withCost} com custo)`);
  console.log(`  variantes vendidas SEM custo: ${missing}`);
  if (siblingExample[0]) {
    console.log(
      `  exemplo fallback sibling: produto com ${siblingExample[0].variants} variantes, ${siblingExample[0].withCost} com custo directo (max ${siblingExample[0].maxCost})`,
    );
  }
  console.log("");
}

// Linhas recentes com custo > 0
const recent = await Order.aggregate([
  {
    $match: {
      deletedAt: null,
      financialStatus: { $in: ["paid", "partially_paid", "partially_refunded"] },
      orderDate: { $gte: new Date("2026-07-10") },
    },
  },
  { $unwind: "$lineItems" },
  {
    $match: {
      "lineItems.unitCost": { $gt: 0 },
      "lineItems.variantId": { $exists: true, $ne: "" },
    },
  },
  {
    $group: {
      _id: "$storeId",
      lines: { $sum: 1 },
      avgCost: { $avg: "$lineItems.unitCost" },
    },
  },
]);

console.log("Linhas com COGS > 0 (10–15 Jul):");
for (const r of recent) {
  const s = stores.find((x) => String(x._id) === String(r._id));
  console.log(
    `  ${s?.name ?? r._id}: ${r.lines} linhas, custo médio ${r.avgCost?.toFixed(2)}`,
  );
}

await mongoose.disconnect();
