/**
 * Diagnóstico live: compara sessões Shopify com/sem filtro de país.
 * Uso: node --experimental-strip-types --import ./tests/resolve-alias.mjs --import ./tests/mock-server-only-hook.mjs scripts/verify-session-sync.ts [storeId]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mongoose from "mongoose";
import { decrypt } from "@/lib/crypto.ts";
import {
  getClientCredentialsToken,
  normalizeShopDomain,
  SHOPIFY_API_VERSION,
} from "@/lib/shopify.ts";
import {
  normalizeSessionCountry,
  sessionCountryLabel,
  sessionCountryShopifyName,
} from "@/lib/shopify-countries.ts";
import { buildDailySessionsQuery } from "@/lib/shopifyql-sessions.ts";
import { syncSessionMetricsForStore, aggregateSessionFunnelFromDb } from "@/lib/session-metrics.ts";
import { fetchDailySessionMetricsFromShopify } from "@/lib/shopify-analytics.ts";
import { Store } from "@/models/Store.ts";
import { addDaysToDateKey, dateKeyInTimezone, normalizeStoreTimezone } from "@/lib/store-timezone.ts";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
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
}

function sumRows(rows: Array<{ sessions: number; cart: number; checkout: number; completed: number }>) {
  return rows.reduce(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      cart: acc.cart + r.cart,
      checkout: acc.checkout + r.checkout,
      completed: acc.completed + r.completed,
    }),
    { sessions: 0, cart: 0, checkout: 0, completed: 0 },
  );
}

async function fetchWithRawQuery(
  store: { shopDomain: string; credentials: string },
  shopifyql: string,
) {
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
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
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
      variables: { q: shopifyql },
    }),
  });
  const json = (await res.json()) as {
    errors?: Array<{ message: string }>;
    data?: {
      shopifyqlQuery?: {
        parseErrors?: string[];
        tableData?: { rows?: unknown };
      };
    };
  };
  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "GraphQL error");
  const payload = json.data?.shopifyqlQuery;
  if (!payload) throw new Error("Sem payload shopifyqlQuery");
  if (payload.parseErrors?.length) throw new Error(payload.parseErrors[0] ?? "parse error");
  const rows = Array.isArray(payload.tableData?.rows) ? payload.tableData.rows : [];
  return rows.length;
}

async function main() {
  loadEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI em falta");

  await mongoose.connect(uri);

  const storeIdArg = process.argv[2];
  const runSync = process.argv.includes("--sync");
  const store = storeIdArg
    ? await Store.findById(storeIdArg).lean()
    : await Store.findOne({
        platform: "shopify",
        deletedAt: null,
        credentials: { $ne: null },
        analyticsSessionCountry: { $nin: [null, ""] },
      })
        .sort({ lastSessionMetricsAt: -1 })
        .lean();

  if (!store) {
    console.log("Nenhuma loja Shopify com país configurado encontrada.");
    process.exit(1);
  }

  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const todayKey = dateKeyInTimezone(new Date(), tz);
  const since = addDaysToDateKey(todayKey, -7, tz);
  const until = addDaysToDateKey(todayKey, -1, tz);
  const countryCode = normalizeSessionCountry(store.analyticsSessionCountry);
  const countryName = countryCode ? sessionCountryShopifyName(countryCode) : null;

  console.log("=== Verificação sync sessões ===");
  console.log(`Loja: ${store.name} (${store._id})`);
  console.log(`País config: ${sessionCountryLabel(store.analyticsSessionCountry)} (${countryCode ?? "todos"})`);
  console.log(`Intervalo: ${since} → ${until} (${tz})`);
  console.log("");

  const prodQuery = buildDailySessionsQuery(since, until, countryCode);
  console.log("Query produção:", prodQuery);
  console.log("");

  const legacyCodeQuery = countryCode
    ? prodQuery.replace(
        `session_country = '${countryName?.replace(/'/g, "''")}'`,
        `session_country_code = '${countryCode}'`,
      )
    : null;

  const [prodRows, globalRows, legacyRows, dbFunnel] = await Promise.all([
    fetchDailySessionMetricsFromShopify(store, since, until),
    fetchDailySessionMetricsFromShopify(
      { ...store, analyticsSessionCountry: null },
      since,
      until,
    ),
    legacyCodeQuery && store.credentials
      ? fetchWithRawQuery(store, legacyCodeQuery.replace(/SINCE.*$/, `SINCE ${since} UNTIL ${until} TIMESERIES day ORDER BY day ASC LIMIT 1000`))
      : Promise.resolve(-1),
    aggregateSessionFunnelFromDb(
      store._id,
      store.analyticsSessionCountry,
      { start: new Date(`${since}T12:00:00Z`), end: new Date(`${until}T12:00:00Z`) },
      null,
      tz,
    ),
  ]);

  const prod = sumRows(prodRows);
  const global = sumRows(globalRows);

  console.log("Shopify (filtro país — query produção):");
  console.log(`  dias=${prodRows.length} sessões=${prod.sessions} atc=${prod.cart} checkout=${prod.checkout} cvr=${prod.completed}`);
  if (prod.sessions > 0) {
    console.log(
      `  ATC%=${((prod.cart / prod.sessions) * 100).toFixed(2)} checkout%=${((prod.checkout / prod.sessions) * 100).toFixed(2)} CVR%=${((prod.completed / prod.sessions) * 100).toFixed(2)}`,
    );
  }

  console.log("");
  console.log("Shopify (todos os países — referência):");
  console.log(`  dias=${globalRows.length} sessões=${global.sessions} atc=${global.cart} checkout=${global.checkout} cvr=${global.completed}`);

  if (legacyCodeQuery) {
    console.log("");
    console.log("Shopify (legado session_country_code — só contagem de linhas):");
    console.log(`  linhas=${legacyRows}`);
  }

  if (runSync) {
    const sync = await syncSessionMetricsForStore(String(store._id));
    console.log("");
    console.log("Sync executado:", sync);
    const dbAfter = await aggregateSessionFunnelFromDb(
      store._id,
      store.analyticsSessionCountry,
      { start: new Date(`${since}T12:00:00Z`), end: new Date(`${until}T12:00:00Z`) },
      null,
      tz,
    );
    console.log("BD após sync:");
    console.log(
      `  sessões=${dbAfter.sessions} ATC%=${dbAfter.atcPct?.toFixed(2) ?? "—"} checkout%=${dbAfter.checkoutPct?.toFixed(2) ?? "—"} CVR%=${dbAfter.cvrPct?.toFixed(2) ?? "—"}`,
    );
    if (dbAfter.error) console.log(`  aviso: ${dbAfter.error}`);
  }

  console.log("");
  console.log("BD (aggregateSessionFunnelFromDb):");
  console.log(
    `  sessões=${dbFunnel.sessions} ATC%=${dbFunnel.atcPct?.toFixed(2) ?? "—"} checkout%=${dbFunnel.checkoutPct?.toFixed(2) ?? "—"} CVR%=${dbFunnel.cvrPct?.toFixed(2) ?? "—"}`,
  );
  if (dbFunnel.error) console.log(`  aviso: ${dbFunnel.error}`);

  console.log("");
  if (countryCode && prod.sessions >= global.sessions && global.sessions > 0) {
    console.log("AVISO: filtro país devolveu >= sessões globais — filtro pode não estar a funcionar.");
    process.exitCode = 2;
  } else if (countryCode && prod.sessions === 0 && global.sessions > 0) {
    console.log("AVISO: filtro país devolveu 0 mas há sessões globais — verifica país ou query.");
    process.exitCode = 2;
  } else if (countryCode && prod.sessions > 0 && prod.sessions < global.sessions) {
    console.log("OK: filtro país reduz sessões vs global (comportamento esperado).");
  } else if (!countryCode) {
    console.log("OK: loja sem filtro de país — sessões globais.");
  } else {
    console.log("Resultado inconclusivo (poucos dados no intervalo).");
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
