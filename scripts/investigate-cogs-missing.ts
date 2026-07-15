/**
 * Investiga variantes vendidas sem COGS — sibling, catálogo, histórico.
 * Uso: node --experimental-strip-types --import ./tests/resolve-alias.mjs scripts/investigate-cogs-missing.ts [storeId]
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

const storeIdArg = process.argv[2] ?? "6a2f3c90f28d6fea7e49ddf3";

const mongoose = (await import("mongoose")).default;
const { Store } = await import("@/models/Store");
const { ProductCost } = await import("@/models/ProductCost");
const { CogsHistory } = await import("@/models/CogsHistory");
const { listSoldVariantsMissingCost } = await import("@/lib/cogs");

await mongoose.connect(process.env.MONGODB_URI!);

const store = await Store.findById(storeIdArg)
  .select("name cogsMode lastSyncAt")
  .lean();
if (!store) {
  console.error("Loja não encontrada.");
  process.exit(1);
}

const storeOid = new mongoose.Types.ObjectId(storeIdArg);
console.log(`\n=== ${store.name} (${storeIdArg}) ===`);
console.log(`Modo COGS: ${store.cogsMode}`);
console.log(`Última sync: ${store.lastSyncAt?.toISOString() ?? "—"}\n`);

const missing = await listSoldVariantsMissingCost([storeOid], {
  assimilateFirst: true,
});
console.log(`Variantes vendidas sem COGS (após assimilação): ${missing.length}\n`);

type Reason =
  | "sem_registo_catalogo"
  | "catalogo_custo_zero"
  | "sibling_tem_custo_nao_aplicado"
  | "produto_sem_custo_nenhuma_variante"
  | "produto_com_custo_noutra_variante";

const buckets = new Map<Reason, number>();

for (const row of missing) {
  const cat = await ProductCost.findOne({
    storeId: storeOid,
    variantId: row.variantId,
  })
    .select("productId title unitCost manualCost price updatedAt")
    .lean();

  let reason: Reason = "sem_registo_catalogo";
  let siblingInfo = "";

  if (cat) {
    const direct =
      (cat.unitCost ?? 0) > 0 || (cat.manualCost != null && cat.manualCost >= 0);
    if (!direct && (cat.unitCost ?? 0) === 0 && cat.manualCost == null) {
      reason = "catalogo_custo_zero";
    }

    if (cat.productId) {
      const siblings = await ProductCost.find({
        storeId: storeOid,
        productId: cat.productId,
        variantId: { $ne: row.variantId },
      })
        .select("variantId title unitCost manualCost")
        .lean();

      const withCost = siblings.filter(
        (s) => (s.unitCost ?? 0) > 0 || (s.manualCost ?? 0) > 0,
      );

      if (withCost.length > 0) {
        const best = withCost.reduce((a, b) =>
          (b.unitCost ?? b.manualCost ?? 0) > (a.unitCost ?? a.manualCost ?? 0)
            ? b
            : a,
        );
        const bestCost = best.unitCost ?? best.manualCost ?? 0;
        siblingInfo = ` | sibling ${best.title?.slice(0, 30)} = ${bestCost}`;
        reason = "sibling_tem_custo_nao_aplicado";
      } else if (siblings.length > 0) {
        reason = "produto_sem_custo_nenhuma_variante";
        siblingInfo = ` | ${siblings.length} irmãs, todas a 0`;
      }
    }
  } else {
    // variantId from order might be numeric string - try gid format
    const hist = await CogsHistory.countDocuments({
      storeId: storeOid,
      variantId: row.variantId,
    });
    if (hist > 0) siblingInfo = ` | ${hist} entradas CogsHistory mas sem ProductCost`;
  }

  buckets.set(reason, (buckets.get(reason) ?? 0) + 1);

  console.log(
    `[${reason}] ${row.title?.slice(0, 55) ?? row.variantId}`,
  );
  console.log(
    `  variantId=${row.variantId} | ${row.unitsSold} un. | ${row.orderCount} enc.${siblingInfo}`,
  );
  if (cat) {
    console.log(
      `  catálogo: unitCost=${cat.unitCost ?? 0} manual=${cat.manualCost ?? "—"} productId=${cat.productId ?? "?"}`,
    );
  }
  console.log("");
}

console.log("--- Resumo ---");
for (const [reason, n] of buckets) {
  console.log(`  ${reason}: ${n}`);
}

console.log(
  "\nPróximo passo sugerido: correr sync produtos (fase products) ou verificar custo na Shopify Admin → Products → Cost per item.",
);

await mongoose.disconnect();
