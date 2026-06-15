/**
 * Diagnóstico de sessões/funil Shopify. Uso:
 *   npx tsx scripts/debug-sessions.ts <storeId> [dateKey]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createRequire } from "module";

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
    /* optional */
  }
}

loadEnv();

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: "server-only",
  filename: "server-only",
  loaded: true,
  exports: {},
} as NodeModule;

async function main() {
  const storeId = process.argv[2] ?? "6a2f3c90f28d6fea7e49ddf3";
  const dateKey = process.argv[3];

  const { connectToDatabase } = await import("../src/lib/db.ts");
  const { Store } = await import("../src/models/Store.ts");
  const { SessionMetricsMonth } = await import(
    "../src/models/SessionMetricsMonth.ts"
  );
  const { decodeMonthBlob } = await import(
    "../src/lib/session-metrics-codec.ts"
  );
  const { sessionCountryKey } = await import("../src/lib/shopify-countries.ts");
  const { buildDailySessionsQuery } = await import(
    "../src/lib/shopifyql-sessions.ts"
  );
  const { fetchDailySessionMetricsFromShopify } = await import(
    "../src/lib/shopify-analytics.ts"
  );
  const { getClientCredentialsToken, normalizeShopDomain } = await import(
    "../src/lib/shopify.ts"
  );
  const { decrypt } = await import("../src/lib/crypto.ts");
  const { normalizeSessionCountry, sessionCountryShopifyName } = await import(
    "../src/lib/shopify-countries.ts"
  );

  await connectToDatabase();
  const store = await Store.findById(storeId).lean();
  if (!store) {
    console.error("Loja não encontrada");
    process.exit(1);
  }

  console.log("=== LOJA ===");
  console.log({
    name: store.name,
    shopDomain: store.shopDomain,
    analyticsSessionCountry: store.analyticsSessionCountry,
    ianaTimezone: store.ianaTimezone,
    scopes: store.scopes,
    lastSessionMetricsAt: store.lastSessionMetricsAt,
    lastSessionMetricsError: store.lastSessionMetricsError,
  });

  const countryKey = sessionCountryKey(store.analyticsSessionCountry);
  const months = await SessionMetricsMonth.find({ storeId: store._id, countryKey })
    .select("monthKey blob")
    .lean();

  console.log("\n=== BD (session_metrics_months) ===");
  console.log(`countryKey: "${countryKey}" | docs: ${months.length}`);
  for (const m of months) {
    const days = decodeMonthBlob(m.blob as Buffer);
    const sample = [...days.entries()].slice(0, 5).map(([dom, c]) => ({
      day: dom,
      ...c,
    }));
    console.log(`month ${m.monthKey}: ${days.size} dias`, sample);
  }

  const since = dateKey ?? "2026-06-01";
  const until = dateKey ?? "2026-06-14";
  const code = normalizeSessionCountry(store.analyticsSessionCountry);
  const name = code ? sessionCountryShopifyName(code) : null;

  console.log("\n=== QUERIES ===");
  console.log("Com código:", buildDailySessionsQuery(since, until, code));
  if (name) {
    const alt = [
      "FROM sessions",
      "SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout",
      `WHERE session_country = '${name.replace(/'/g, "''")}'`,
      `SINCE ${since} UNTIL ${until}`,
      "TIMESERIES day",
      "ORDER BY day ASC",
      "LIMIT 1000",
    ].join(" ");
    console.log("Com nome país:", alt);
  }
  console.log("Sem país:", buildDailySessionsQuery(since, until, null));

  console.log("\n=== API SHOPIFY (query actual) ===");
  try {
    const rows = await fetchDailySessionMetricsFromShopify(store, since, until);
    console.log(`OK: ${rows.length} linhas`);
    console.log(rows.slice(-7));
  } catch (e) {
    console.error("ERRO:", e instanceof Error ? e.message : e);
  }

  if (code && name) {
    console.log("\n=== API sem filtro país ===");
    try {
      const creds = JSON.parse(decrypt(store.credentials!)) as {
        clientId: string;
        clientSecret: string;
      };
      const domain = normalizeShopDomain(store.shopDomain!);
      const { accessToken, scope } = await getClientCredentialsToken(
        domain,
        creds.clientId,
        creds.clientSecret,
      );
      console.log("Token scopes:", scope);

      const q = buildDailySessionsQuery(since, until, null);
      const url = `https://${domain}/admin/api/${process.env.SHOPIFY_API_VERSION ?? "2025-10"}/graphql.json`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: `query($q: String!) {
            shopifyqlQuery(query: $q) {
              tableData { columns { name } rows }
              parseErrors
            }
          }`,
          variables: { q },
        }),
      });
      const json = await res.json();
      const rows = json?.data?.shopifyqlQuery?.tableData?.rows ?? [];
      const parseErrors = json?.data?.shopifyqlQuery?.parseErrors ?? [];
      console.log("parseErrors:", parseErrors);
      console.log("rows (últimas 5):", Array.isArray(rows) ? rows.slice(-5) : rows);
      if (json.errors) console.log("graphql errors:", json.errors);
    } catch (e) {
      console.error(e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
