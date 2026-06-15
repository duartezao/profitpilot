import "server-only";
import { decrypt } from "@/lib/crypto";
import {
  normalizeShopDomain,
  SHOPIFY_API_VERSION,
  getClientCredentialsToken,
} from "@/lib/shopify";
import { normalizeSessionCountry } from "@/lib/shopify-countries";
import { buildDailySessionsQuery } from "@/lib/shopifyql-sessions";
import type { StoreDoc } from "@/models/Store";

type GraphQLResult<T> = { data?: T; errors?: Array<{ message: string }> };

export type DailySessionRow = {
  dateKey: string;
  sessions: number;
  cart: number;
  checkout: number;
  completed: number;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function shopifyGraphQL<T>(
  domain: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Shopify respondeu ${res.status}.`);
  }

  const json = (await res.json()) as GraphQLResult<T>;
  if (json.errors?.length) {
    const msg = json.errors[0].message;
    if (/access denied|unauthorized|read_reports/i.test(msg)) {
      throw new Error(
        `${msg} — confirma o scope read_reports na app Shopify.`,
      );
    }
    throw new Error(msg);
  }
  if (!json.data) {
    throw new Error("Resposta vazia da Shopify.");
  }
  return json.data;
}

function normalizeDayKey(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function dayKeyFromRow(
  row: Record<string, unknown>,
  columns: Array<{ name: string }>,
): string | null {
  const direct =
    normalizeDayKey(row.day) ??
    normalizeDayKey(row.session_day) ??
    normalizeDayKey(row["day.session_timestamp"]);
  if (direct) return direct;

  for (const col of columns) {
    if (/day|date|timestamp/i.test(col.name)) {
      const key = normalizeDayKey(row[col.name]);
      if (key) return key;
    }
  }
  return null;
}

function metricFromRow(
  row: Record<string, unknown>,
  names: string[],
): number {
  for (const name of names) {
    if (row[name] != null) return num(row[name]);
  }
  return 0;
}

type ShopifyQLData = {
  shopifyqlQuery: {
    tableData: {
      columns: Array<{ name: string }>;
      rows: unknown;
    } | null;
    parseErrors: string[];
  } | null;
};

function parseSessionRows(
  rows: unknown,
  columns: Array<{ name: string }>,
): DailySessionRow[] {
  if (!Array.isArray(rows)) return [];

  const out: DailySessionRow[] = [];

  for (const raw of rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const dateKey = dayKeyFromRow(row, columns);
    if (!dateKey) continue;

    out.push({
      dateKey,
      sessions: metricFromRow(row, ["sessions"]),
      cart: metricFromRow(row, ["sessions_with_cart_additions"]),
      checkout: metricFromRow(row, ["sessions_that_reached_checkout"]),
      completed: metricFromRow(row, ["sessions_that_completed_checkout"]),
    });
  }

  return out;
}

/**
 * Pedido ShopifyQL por intervalo de dias (TIMESERIES day).
 * Usado apenas no sync — a dashboard lê da BD.
 */
export async function fetchDailySessionMetricsFromShopify(
  store: StoreDoc,
  since: string,
  until: string,
): Promise<DailySessionRow[]> {
  const countryCode = normalizeSessionCountry(store.analyticsSessionCountry);

  if (!store.credentials || !store.shopDomain) {
    throw new Error("Loja sem credenciais Shopify.");
  }
  if (store.analyticsSessionCountry?.trim() && !countryCode) {
    throw new Error("País de sessões inválido.");
  }

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

  const shopifyql = buildDailySessionsQuery(since, until, countryCode);
  const data = await shopifyGraphQL<ShopifyQLData>(
    domain,
    accessToken,
    `query($q: String!) {
      shopifyqlQuery(query: $q) {
        tableData {
          columns { name dataType }
          rows
        }
        parseErrors
      }
    }`,
    { q: shopifyql },
  );

  const payload = data.shopifyqlQuery;
  if (!payload) {
    throw new Error("Shopify não devolveu dados de sessões.");
  }

  const parseErrors = payload.parseErrors ?? [];
  if (parseErrors.length) {
    throw new Error(parseErrors[0] ?? "Erro ao ler analytics Shopify.");
  }

  const table = payload.tableData;
  const columns = table?.columns ?? [];
  const rows = parseSessionRows(table?.rows, columns);

  if (!rows.length) {
    throw new Error(
      `Shopify devolveu 0 linhas para sessões (${since} → ${until}). Query: ${shopifyql}`,
    );
  }

  return rows;
}
