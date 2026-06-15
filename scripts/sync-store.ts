/**
 * Sync manual de uma loja (dev/ops). Uso:
 *   npx tsx scripts/sync-store.ts <storeId>
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* .env opcional se vars já estiverem definidas */
  }
}

loadEnv();

// Permite importar módulos Next "server-only" fora da app.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: "server-only",
  filename: "server-only",
  loaded: true,
  exports: {},
} as NodeModule;

async function main() {
  const storeId = process.argv[2];
  if (!storeId) {
    console.error("Uso: npx tsx scripts/sync-store.ts <storeId>");
    process.exit(1);
  }

  const { connectToDatabase } = await import("../src/lib/db");
  const { syncStore } = await import("../src/lib/shopify-sync");

  await connectToDatabase();
  console.log(`A sincronizar loja ${storeId}…`);
  const r = await syncStore(storeId);
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
