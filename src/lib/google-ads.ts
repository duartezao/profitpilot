/**
 * Google Ads API — daily spend via GAQL.
 * @see https://developers.google.com/google-ads/api/docs/start
 *
 * Por conta: refresh token OAuth + customer ID (10 dígitos).
 * Servidor: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET.
 */

import {
  formatCampaignStatusLabel,
  metricsFromCampaignTotals,
  roasFromCampaign,
  shouldIncludeCampaignForDay,
  type LiveCampaignRow,
} from "@/lib/ad-campaign-types";

/** Versão REST da Google Ads API — v17 está obsoleta; usar v23+ (2026). */
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v23";
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${API_VERSION}`;

export type GoogleAdAccountOption = {
  id: string;
  name: string;
  currency: string;
  /** MCC a usar na API — preenchido quando a conta vem de um gestor. */
  loginCustomerId?: string;
};

export class GoogleAdsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

function numFromGoogleMetrics(
  metrics: Record<string, unknown> | undefined,
  ...keys: string[]
): number {
  if (!metrics) return 0;
  for (const key of keys) {
    const raw = metrics[key];
    if (raw === undefined || raw === null) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Lê valor de conversão para ROAS — só metrics.conversions_value (compras), não all_conversions. */
function googleConversionsFromMetrics(
  metrics: Record<string, unknown> | undefined,
): { conversions: number; conversionValue: number } {
  if (!metrics) return { conversions: 0, conversionValue: 0 };

  const conversions = numFromGoogleMetrics(metrics, "conversions");
  const conversionValue = numFromGoogleMetrics(
    metrics,
    "conversionsValue",
    "conversions_value",
  );

  return { conversions, conversionValue };
}

type GoogleCampaignDayRow = {
  campaign?: { id?: string; name?: string; status?: string };
  metrics?: Record<string, unknown>;
  customer?: { currencyCode?: string };
};

function mergeGoogleCampaignDayRows(
  trafficRows: GoogleCampaignDayRow[],
  convRows: GoogleCampaignDayRow[],
): GoogleCampaignDayRow[] {
  const convById = new Map<string, Record<string, unknown>>();
  for (const row of convRows) {
    const id = String(row.campaign?.id ?? "").trim();
    if (!id || !row.metrics) continue;
    convById.set(id, row.metrics);
  }

  const merged: GoogleCampaignDayRow[] = [];
  const seen = new Set<string>();

  for (const row of trafficRows) {
    const id = String(row.campaign?.id ?? "").trim();
    if (!id) continue;
    seen.add(id);
    const convMetrics = convById.get(id);
    merged.push({
      ...row,
      metrics: convMetrics ? { ...row.metrics, ...convMetrics } : row.metrics,
    });
  }

  for (const row of convRows) {
    const id = String(row.campaign?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    const { conversions, conversionValue } = googleConversionsFromMetrics(row.metrics);
    if (conversions <= 0 && conversionValue <= 0) continue;
    merged.push(row);
  }

  return merged;
}

/**
 * Campanhas por dia — dois pedidos GAQL (documentação Google).
 * Tráfego e conversões separados para evitar INVALID_ARGUMENT ao misturar métricas.
 * @see https://developers.google.com/google-ads/api/docs/conversions/reporting
 */
async function fetchGoogleCampaignDayRows(
  accessToken: string,
  customerId: string,
  dateKey: string,
  loginCustomerId: string | undefined,
  includeStatus: boolean,
): Promise<GoogleCampaignDayRow[]> {
  const idFields = includeStatus
    ? "campaign.id, campaign.name, campaign.status, "
    : "campaign.id, ";

  const trafficQuery =
    `SELECT ${idFields}metrics.cost_micros, metrics.impressions, metrics.clicks, ` +
    `customer.currency_code FROM campaign WHERE segments.date = '${dateKey}'`;

  const trafficRows = await googleAdsSearch<GoogleCampaignDayRow>(
    accessToken,
    customerId,
    trafficQuery,
    loginCustomerId,
  );

  let convRows: GoogleCampaignDayRow[] = [];
  try {
    convRows = await googleAdsSearch<GoogleCampaignDayRow>(
      accessToken,
      customerId,
      `SELECT campaign.id, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date = '${dateKey}'`,
      loginCustomerId,
    );
  } catch {
    /* sem conversões — mantém tráfego */
  }

  return mergeGoogleCampaignDayRows(trafficRows, convRows);
}

function requireGoogleOAuthEnv() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new GoogleAdsApiError(
      "OAuth Google não configurado (GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET).",
    );
  }
  return { clientId, clientSecret };
}

function requireGoogleApiEnv() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const { clientId, clientSecret } = requireGoogleOAuthEnv();
  if (!developerToken) {
    throw new GoogleAdsApiError(
      "Google Ads API não configurada no servidor — falta GOOGLE_ADS_DEVELOPER_TOKEN na Vercel. Podes guardar a conta com Customer ID; o sync automático só funciona depois de configurares o token.",
    );
  }
  return { developerToken, clientId, clientSecret };
}

/** @deprecated use requireGoogleApiEnv — mantido para chamadas internas à Ads API. */
function requireGoogleEnv() {
  return requireGoogleApiEnv();
}

/** Diagnóstico — OAuth pode funcionar só com client id/secret; a API exige também developer token. */
export function googleAdsServerConfigStatus(): {
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  developerTokenConfigured: boolean;
  apiReady: boolean;
  apiVersion: string;
} {
  const clientIdConfigured = Boolean(process.env.GOOGLE_ADS_CLIENT_ID?.trim());
  const clientSecretConfigured = Boolean(
    process.env.GOOGLE_ADS_CLIENT_SECRET?.trim(),
  );
  const developerTokenConfigured = Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim(),
  );
  return {
    clientIdConfigured,
    clientSecretConfigured,
    developerTokenConfigured,
    apiReady:
      clientIdConfigured && clientSecretConfigured && developerTokenConfigured,
    apiVersion: API_VERSION,
  };
}

/** Testa se o developer token responde (sem expor o token). */
export async function probeGoogleAdsApiAccess(
  refreshToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await listGoogleAdAccounts(refreshToken);
    return { ok: true };
  } catch (e) {
    const raw = e instanceof GoogleAdsApiError ? e.message : "Erro desconhecido.";
    return { ok: false, error: humanizeGoogleAdsError(raw) };
  }
}

export function isGoogleAdsServerConfigError(message: string): boolean {
  return (
    message.includes("Google Ads API não configurada no servidor") ||
    message.includes("falta GOOGLE_ADS_DEVELOPER_TOKEN")
  );
}

/** Valida formato local do Customer ID (sem chamar a API). */
export function resolveGoogleCustomerIdLocal(
  customerId: string,
): { id: string; name: string } {
  const id = normalizeCustomerId(customerId);
  return { id, name: `Google Ads ${id}` };
}

export function normalizeCustomerId(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length < 10) {
    throw new GoogleAdsApiError("Customer ID inválido (10 dígitos, sem hífens).");
  }
  return digits;
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<string> {
  const { clientId, clientSecret } = requireGoogleOAuthEnv();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken.trim(),
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new GoogleAdsApiError(
      json.error_description ??
        json.error ??
        "Não foi possível renovar o token Google.",
    );
  }
  return json.access_token;
}

export function isGooglePermissionError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("permission") ||
    m.includes("caller does not have") ||
    m.includes("user_permission_denied")
  );
}

/** Manager account ID opcional (contas via MCC). */
function envLoginCustomerId(): string | null {
  const raw = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
  if (!raw) return null;
  try {
    return normalizeCustomerId(raw);
  } catch {
    return null;
  }
}

export function humanizeGoogleAdsError(
  raw: string,
  customerId?: string,
): string {
  const m = raw.toLowerCase();
  const idHint = customerId ? ` (${customerId})` : "";

  if (
    m.includes("caller does not have permission") ||
    m.includes("permission_denied") ||
    m.includes("user_permission_denied")
  ) {
    return (
      `Sem permissão na conta Google Ads${idHint}. Confirma: (1) o Gmail em Definições é o que aceitou o convite; ` +
      `(2) o developer token tem acesso Basic/Standard no API Center (modo Test só acede a contas de teste); ` +
      `(3) se a conta foi partilhada via MCC, indica o Customer ID do gestor (MCC) ao ligar a conta; ` +
      `(4) o Customer ID da conta está correcto. O gasto manual continua a funcionar.`
    );
  }
  if (m.includes("test account")) {
    return (
      "Developer token em modo Test — só acede a contas de teste. Pede acesso Basic/Standard no Google Ads API Center."
    );
  }
  if (m.includes("unauthenticated") || m.includes("developer-token")) {
    return `Developer token ou OAuth rejeitado pela Google: ${raw}`;
  }
  return raw;
}

async function googleAdsSearchOnce<T>(
  accessToken: string,
  customerId: string,
  query: string,
  loginCustomerId?: string,
): Promise<T[]> {
  const { developerToken } = requireGoogleApiEnv();
  const cid = normalizeCustomerId(customerId);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const all: T[] = [];
  let pageToken: string | undefined;
  do {
    const body: { query: string; pageToken?: string } = { query };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(
      `${GOOGLE_ADS_BASE}/customers/${cid}/googleAds:search`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const json = (await res.json()) as {
      results?: T[];
      nextPageToken?: string;
      error?: { message?: string; status?: string };
    };
    if (!res.ok) {
      const raw = json.error?.message ?? `Google Ads API HTTP ${res.status}`;
      throw new GoogleAdsApiError(humanizeGoogleAdsError(raw, cid));
    }
    all.push(...(json.results ?? []));
    pageToken = json.nextPageToken || undefined;
  } while (pageToken);

  return all;
}

async function googleAdsSearch<T>(
  accessToken: string,
  customerId: string,
  query: string,
  preferredLoginCustomerId?: string,
): Promise<T[]> {
  const cid = normalizeCustomerId(customerId);
  const envLogin = envLoginCustomerId();

  if (preferredLoginCustomerId) {
    try {
      return await googleAdsSearchOnce(
        accessToken,
        cid,
        query,
        normalizeCustomerId(preferredLoginCustomerId),
      );
    } catch (e) {
      const msg = e instanceof GoogleAdsApiError ? e.message : String(e);
      if (!isGooglePermissionError(msg)) throw e;
    }
  }

  if (preferredLoginCustomerId === undefined && envLogin) {
    try {
      return await googleAdsSearchOnce(accessToken, cid, query, envLogin);
    } catch (e) {
      const msg = e instanceof GoogleAdsApiError ? e.message : String(e);
      if (!isGooglePermissionError(msg)) throw e;
    }
  }

  try {
    return await googleAdsSearchOnce(accessToken, cid, query);
  } catch (e) {
    const msg = e instanceof GoogleAdsApiError ? e.message : String(e);
    if (!isGooglePermissionError(msg)) throw e;

    let hints: string[] = [];
    try {
      hints = await fetchAccessibleCustomerIds(accessToken);
    } catch {
      /* ignora */
    }

    const attempts = [
      envLogin,
      preferredLoginCustomerId
        ? normalizeCustomerId(preferredLoginCustomerId)
        : undefined,
      cid,
      ...hints.filter((id) => id !== cid),
    ].filter((id): id is string => Boolean(id));
    const seen = new Set<string>();

    for (const loginId of attempts) {
      if (seen.has(loginId)) continue;
      seen.add(loginId);
      try {
        return await googleAdsSearchOnce(accessToken, cid, query, loginId);
      } catch {
        /* próximo login-customer-id */
      }
    }
    throw e;
  }
}

const GOOGLE_PROBE_QUERY = "SELECT customer.id FROM customer LIMIT 1";

/** Descobre qual login-customer-id (MCC) permite aceder à conta cliente. */
export async function resolveGoogleLoginCustomerId(
  refreshToken: string,
  customerId: string,
  manualLoginCustomerId?: string,
): Promise<string | undefined> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const cid = normalizeCustomerId(customerId);
  let accessible: string[] = [];
  try {
    accessible = await fetchAccessibleCustomerIds(accessToken);
  } catch {
    /* ignora */
  }

  const order: (string | undefined)[] = [
    manualLoginCustomerId?.trim()
      ? normalizeCustomerId(manualLoginCustomerId)
      : undefined,
    envLoginCustomerId() ?? undefined,
    undefined,
    ...accessible.filter((id) => id !== cid),
    cid,
  ];
  const seen = new Set<string>();

  for (const loginId of order) {
    const key = loginId ?? "__direct__";
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await googleAdsSearchOnce(accessToken, cid, GOOGLE_PROBE_QUERY, loginId);
      return loginId;
    } catch {
      /* tenta seguinte */
    }
  }

  for (const managerId of accessible) {
    try {
      const clients = await listGoogleClientAccountsUnderManager(
        accessToken,
        managerId,
      );
      if (!clients.some((c) => normalizeCustomerId(c.id) === cid)) continue;
      try {
        await googleAdsSearchOnce(
          accessToken,
          cid,
          GOOGLE_PROBE_QUERY,
          managerId,
        );
        return managerId;
      } catch {
        /* gestor listou mas sem permissão API */
      }
    } catch {
      /* não é gestor */
    }
  }

  return undefined;
}

async function fetchAccessibleCustomerIds(
  accessToken: string,
): Promise<string[]> {
  const { developerToken } = requireGoogleApiEnv();
  const res = await fetch(`${GOOGLE_ADS_BASE}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
    cache: "no-store",
  });
  const json = (await res.json()) as {
    resourceNames?: string[];
    error?: { message?: string };
  };
  if (!res.ok) {
    const raw = json.error?.message ?? "Não foi possível listar contas Google Ads.";
    throw new GoogleAdsApiError(humanizeGoogleAdsError(raw));
  }
  return (json.resourceNames ?? []).map((r) => r.replace("customers/", ""));
}

const CUSTOMER_CLIENT_QUERY = `
SELECT
  customer_client.client_customer,
  customer_client.descriptive_name,
  customer_client.currency_code,
  customer_client.manager,
  customer_client.hidden,
  customer_client.level,
  customer_client.status
FROM customer_client
WHERE customer_client.level <= 2
  AND customer_client.status = 'ENABLED'
`;

function parseClientCustomerId(resource: string): string {
  return resource.replace("customers/", "").replace(/\D/g, "");
}

async function listGoogleClientAccountsUnderManager(
  accessToken: string,
  managerId: string,
): Promise<GoogleAdAccountOption[]> {
  const rows = await googleAdsSearchOnce<{
    customerClient?: {
      clientCustomer?: string;
      descriptiveName?: string;
      currencyCode?: string;
      manager?: boolean;
      hidden?: boolean;
    };
  }>(accessToken, managerId, CUSTOMER_CLIENT_QUERY, managerId);

  const out: GoogleAdAccountOption[] = [];
  for (const row of rows) {
    const cc = row.customerClient;
    if (!cc?.clientCustomer || cc.hidden) continue;
    const id = parseClientCustomerId(cc.clientCustomer);
    if (!id || id.length < 10) continue;
    if (cc.manager && id === normalizeCustomerId(managerId)) continue;
    out.push({
      id,
      name: cc.descriptiveName?.trim() || `Conta ${id}`,
      currency: cc.currencyCode ?? "USD",
      loginCustomerId: normalizeCustomerId(managerId),
    });
  }
  return out;
}

async function enrichGoogleAccount(
  accessToken: string,
  customerId: string,
  loginCustomerIds: string[],
): Promise<GoogleAdAccountOption | null> {
  const cid = normalizeCustomerId(customerId);
  const query =
    "SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1";
  const attempts: (string | undefined)[] = [
    undefined,
    envLoginCustomerId() ?? undefined,
    ...loginCustomerIds.filter((id) => id !== cid),
    cid,
  ];
  const seen = new Set<string>();

  for (const loginId of attempts) {
    const key = loginId ?? "__direct__";
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const rows = await googleAdsSearchOnce<{
        customer?: { descriptiveName?: string; currencyCode?: string };
      }>(accessToken, cid, query, loginId);
      const row = rows[0]?.customer;
      if (!row) continue;
      return {
        id: cid,
        name: row.descriptiveName?.trim() || `Conta ${cid}`,
        currency: row.currencyCode ?? "USD",
      };
    } catch {
      /* tenta outro login-customer-id */
    }
  }
  return null;
}

/** Lista customers acessíveis com o refresh token (directos + clientes via MCC). */
export async function listGoogleAdAccounts(
  refreshToken: string,
): Promise<GoogleAdAccountOption[]> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const directIds = await fetchAccessibleCustomerIds(accessToken);

  if (directIds.length === 0) {
    throw new GoogleAdsApiError(
      "Nenhuma conta Google Ads acessível com este Gmail. Confirma: (1) autorizaste o mesmo Gmail em Definições que aceitou o convite na conta; (2) o convite foi aceite no Google Ads; (3) o developer token não está só em modo Test. Podes ligar com Customer ID manual.",
    );
  }

  const byId = new Map<string, GoogleAdAccountOption>();

  for (const id of directIds) {
    byId.set(id, { id, name: `Conta ${id}`, currency: "USD" });
  }

  for (const managerId of directIds) {
    try {
      for (const client of await listGoogleClientAccountsUnderManager(
        accessToken,
        managerId,
      )) {
        const existing = byId.get(client.id);
        if (!existing || existing.name.startsWith("Conta ")) {
          byId.set(client.id, client);
        }
      }
    } catch {
      /* não é gestora ou sem permissão para listar clientes */
    }
  }

  for (const id of [...byId.keys()]) {
    const current = byId.get(id)!;
    if (!current.name.startsWith("Conta ")) continue;
    const enriched = await enrichGoogleAccount(accessToken, id, directIds);
    if (enriched) byId.set(id, enriched);
  }

  const accounts = [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt"),
  );

  if (accounts.length === 0) {
    throw new GoogleAdsApiError(
      "Nenhuma conta Google Ads listada com este Gmail — confirma o convite ou usa Customer ID manual.",
    );
  }

  return accounts;
}

export async function verifyGoogleAdAccountAccess(
  refreshToken: string,
  customerId: string,
  manualLoginCustomerId?: string,
): Promise<{ name: string; currency: string; loginCustomerId?: string }> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const cid = normalizeCustomerId(customerId);
  const loginCustomerId = await resolveGoogleLoginCustomerId(
    refreshToken,
    cid,
    manualLoginCustomerId,
  );

  let accessible: string[] = [];
  try {
    accessible = await fetchAccessibleCustomerIds(accessToken);
  } catch {
    /* ignora */
  }

  const query =
    "SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1";

  const attempts: (string | undefined)[] = [
    loginCustomerId,
    manualLoginCustomerId?.trim()
      ? normalizeCustomerId(manualLoginCustomerId)
      : undefined,
    envLoginCustomerId() ?? undefined,
    undefined,
    ...accessible.filter((id) => id !== cid),
    cid,
  ];
  const seen = new Set<string>();

  for (const loginId of attempts) {
    const key = loginId ?? "__direct__";
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const rows = await googleAdsSearchOnce<{
        customer?: { descriptiveName?: string; currencyCode?: string };
      }>(accessToken, cid, query, loginId);
      const row = rows[0]?.customer;
      if (!row) continue;
      return {
        name: row.descriptiveName?.trim() || `Conta ${cid}`,
        currency: row.currencyCode ?? "USD",
        loginCustomerId: loginId,
      };
    } catch {
      /* tenta outro login */
    }
  }

  throw new GoogleAdsApiError(
    humanizeGoogleAdsError("USER_PERMISSION_DENIED", cid),
  );
}

/** Gasto num único dia (segments.date). */
export async function fetchGoogleAdSpendForDay(
  refreshToken: string,
  customerId: string,
  dateKey: string,
  loginCustomerId?: string,
): Promise<{ spend: number; currency: string }> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const rows = await googleAdsSearch<{
    metrics?: { costMicros?: string };
    customer?: { currencyCode?: string };
  }>(
    accessToken,
    customerId,
    `SELECT metrics.cost_micros, customer.currency_code FROM customer WHERE segments.date = '${dateKey}'`,
    loginCustomerId,
  );
  let micros = 0;
  let currency = "USD";
  for (const row of rows) {
    micros += Number(row?.metrics?.costMicros ?? 0);
    if (row?.customer?.currencyCode) {
      currency = row.customer.currencyCode;
    }
  }
  const spend = Number.isFinite(micros) ? micros / 1_000_000 : 0;
  return { spend, currency };
}

export type GoogleAdInsightsDay = {
  spend: number;
  impressions: number;
  clicks: number;
  currency: string;
};

export async function fetchGoogleAdInsightsForDay(
  refreshToken: string,
  customerId: string,
  dateKey: string,
  loginCustomerId?: string,
): Promise<GoogleAdInsightsDay> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const rows = await googleAdsSearch<{
    metrics?: {
      costMicros?: string;
      impressions?: string;
      clicks?: string;
    };
    customer?: { currencyCode?: string };
  }>(
    accessToken,
    customerId,
    `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, customer.currency_code FROM customer WHERE segments.date = '${dateKey}'`,
    loginCustomerId,
  );
  const row = rows[0];
  const micros = numFromGoogleMetrics(row?.metrics, "costMicros", "cost_micros");
  const spend = Number.isFinite(micros) ? micros / 1_000_000 : 0;
  return {
    spend,
    impressions: numFromGoogleMetrics(row?.metrics, "impressions"),
    clicks: numFromGoogleMetrics(row?.metrics, "clicks"),
    currency: row?.customer?.currencyCode ?? "USD",
  };
}

export type CampaignInsightsRow = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  currency: string;
  status?: string;
  statusLabel?: string;
};

type GoogleCampaignStatusRow = {
  campaign?: { id?: string; name?: string; status?: string };
};

function buildGoogleCampaignInsightRows(
  statusRows: GoogleCampaignStatusRow[],
  metricsRows: GoogleCampaignDayRow[],
): CampaignInsightsRow[] {
  const metricsById = new Map<
    string,
    {
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      conversionValue: number;
      currency: string;
    }
  >();
  let currency = "USD";

  for (const row of metricsRows) {
    const id = String(row?.campaign?.id ?? "").trim();
    if (!id) continue;
    if (row?.customer?.currencyCode) currency = row.customer.currencyCode;
    const micros = numFromGoogleMetrics(row?.metrics, "costMicros", "cost_micros");
    const spend = Number.isFinite(micros) ? micros / 1_000_000 : 0;
    const { conversions, conversionValue } = googleConversionsFromMetrics(
      row?.metrics,
    );
    metricsById.set(id, {
      spend,
      impressions: numFromGoogleMetrics(row?.metrics, "impressions") || 0,
      clicks: numFromGoogleMetrics(row?.metrics, "clicks") || 0,
      conversions,
      conversionValue,
      currency: row?.customer?.currencyCode ?? currency,
    });
  }

  const out: CampaignInsightsRow[] = [];
  const seen = new Set<string>();

  for (const row of statusRows) {
    const id = String(row?.campaign?.id ?? "").trim();
    const status = row?.campaign?.status?.trim() || "";
    if (!id) continue;
    if (status !== "ENABLED" && status !== "PAUSED") continue;

    const m = metricsById.get(id);
    if (
      !shouldIncludeCampaignForDay(status, {
        spend: m?.spend,
        impressions: m?.impressions,
        clicks: m?.clicks,
        conversions: m?.conversions,
      })
    ) {
      continue;
    }

    out.push({
      campaignId: id,
      campaignName: row?.campaign?.name?.trim() || `Campanha ${id}`,
      spend: m?.spend ?? 0,
      impressions: m?.impressions ?? 0,
      clicks: m?.clicks ?? 0,
      conversions: m?.conversions ?? 0,
      conversionValue: m?.conversionValue ?? 0,
      currency: m?.currency ?? currency,
      status,
      statusLabel: formatCampaignStatusLabel(status),
    });
    seen.add(id);
  }

  for (const [id, m] of metricsById) {
    if (seen.has(id)) continue;
    out.push({
      campaignId: id,
      campaignName: `Campanha ${id}`,
      spend: m.spend,
      impressions: m.impressions,
      clicks: m.clicks,
      conversions: m.conversions,
      conversionValue: m.conversionValue,
      currency: m.currency,
      status: "ENABLED",
      statusLabel: "Activa",
    });
  }

  return out;
}

/** Insights por campanha num dia (activas sempre; pausadas só com actividade no dia). */
export async function fetchGoogleCampaignInsightsForDay(
  refreshToken: string,
  customerId: string,
  dateKey: string,
  loginCustomerId?: string,
): Promise<CampaignInsightsRow[]> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const cid = normalizeCustomerId(customerId);

  const statusRows = await googleAdsSearch<GoogleCampaignStatusRow>(
    accessToken,
    cid,
    `SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.status IN ('ENABLED', 'PAUSED')`,
    loginCustomerId,
  );

  const metricsRows = await fetchGoogleCampaignDayRows(
    accessToken,
    cid,
    dateKey,
    loginCustomerId,
    false,
  );

  return buildGoogleCampaignInsightRows(statusRows, metricsRows);
}

/** Campanhas activas/pausadas com métricas de hoje. */
export async function fetchGoogleLiveCampaigns(
  refreshToken: string,
  customerId: string,
  dateKey: string,
  loginCustomerId?: string,
): Promise<LiveCampaignRow[]> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const cid = normalizeCustomerId(customerId);

  const statusRows = await googleAdsSearch<GoogleCampaignStatusRow>(
    accessToken,
    cid,
    `SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.status IN ('ENABLED', 'PAUSED')`,
    loginCustomerId,
  );

  const metricsRows = await fetchGoogleCampaignDayRows(
    accessToken,
    cid,
    dateKey,
    loginCustomerId,
    false,
  );

  const insightRows = buildGoogleCampaignInsightRows(statusRows, metricsRows);

  return insightRows
    .map((r) => ({
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      platform: "google" as const,
      platformLabel: "Google",
      adAccountId: cid,
      adAccountName: cid,
      status: r.status ?? "ENABLED",
      statusLabel: r.statusLabel ?? "Activa",
      spend: r.spend,
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      conversionValue: r.conversionValue,
      currency: r.currency,
      roas: roasFromCampaign(r.spend, r.conversionValue),
      ...metricsFromCampaignTotals(r.spend, r.impressions, r.clicks),
    }))
    .sort((a, b) => b.spend - a.spend);
}

export type CampaignLandingUrlsRow = {
  campaignId: string;
  campaignName: string;
  landingUrls: string[];
};

/**
 * URLs de destino por campanha — agrega todas as fontes disponíveis:
 * - ads clássicos: final_urls + final_mobile_urls
 * - Performance Max: asset_group.final_urls
 * - landing_page_view: URLs reais com cliques (Shopping/DSA/PMax/product)
 * Cada fonte falha de forma independente (não zera as outras).
 */
export async function fetchGoogleCampaignLandingUrls(
  refreshToken: string,
  customerId: string,
  loginCustomerId?: string,
): Promise<CampaignLandingUrlsRow[]> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const cid = normalizeCustomerId(customerId);

  const byCampaign = new Map<
    string,
    { name: string; urls: Set<string> }
  >();

  const addUrls = (
    campaignId: string,
    campaignName: string,
    urls: Array<string | null | undefined>,
  ) => {
    const id = String(campaignId ?? "").trim();
    if (!id) return;
    let entry = byCampaign.get(id);
    if (!entry) {
      entry = {
        name: campaignName.trim() || `Campanha ${id}`,
        urls: new Set(),
      };
      byCampaign.set(id, entry);
    } else if (campaignName.trim()) {
      entry.name = campaignName.trim();
    }
    for (const u of urls) {
      if (typeof u === "string" && u.trim()) entry.urls.add(u.trim());
    }
  };

  type AdUrlRow = {
    campaign?: { id?: string; name?: string };
    adGroupAd?: {
      ad?: {
        finalUrls?: string[];
        finalMobileUrls?: string[];
        trackingUrlTemplate?: string | null;
      };
    };
  };

  try {
    const rows = await googleAdsSearch<AdUrlRow>(
      accessToken,
      cid,
      `SELECT campaign.id, campaign.name, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls ` +
        `FROM ad_group_ad ` +
        `WHERE campaign.status != 'REMOVED'`,
      loginCustomerId,
    );
    for (const row of rows) {
      const ad = row.adGroupAd?.ad;
      addUrls(String(row.campaign?.id ?? ""), row.campaign?.name ?? "", [
        ...(ad?.finalUrls ?? []),
        ...(ad?.finalMobileUrls ?? []),
      ]);
    }
  } catch {
    /* ads clássicos — continua com outras fontes */
  }

  type AssetGroupRow = {
    campaign?: { id?: string; name?: string };
    assetGroup?: { finalUrls?: string[]; finalMobileUrls?: string[] };
  };
  try {
    const rows = await googleAdsSearch<AssetGroupRow>(
      accessToken,
      cid,
      `SELECT campaign.id, campaign.name, asset_group.final_urls, asset_group.final_mobile_urls ` +
        `FROM asset_group ` +
        `WHERE campaign.status != 'REMOVED'`,
      loginCustomerId,
    );
    for (const row of rows) {
      const ag = row.assetGroup;
      addUrls(String(row.campaign?.id ?? ""), row.campaign?.name ?? "", [
        ...(ag?.finalUrls ?? []),
        ...(ag?.finalMobileUrls ?? []),
      ]);
    }
  } catch {
    /* PMax opcional */
  }

  // URLs reais com tráfego — cobre Shopping, DSA, PMax product pages, etc.
  type LandingPageRow = {
    campaign?: { id?: string; name?: string };
    landingPageView?: { unexpandedFinalUrl?: string };
  };
  try {
    const rows = await googleAdsSearch<LandingPageRow>(
      accessToken,
      cid,
      `SELECT campaign.id, campaign.name, landing_page_view.unexpanded_final_url ` +
        `FROM landing_page_view ` +
        `WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'`,
      loginCustomerId,
    );
    for (const row of rows) {
      addUrls(String(row.campaign?.id ?? ""), row.campaign?.name ?? "", [
        row.landingPageView?.unexpandedFinalUrl,
      ]);
    }
  } catch {
    /* landing_page_view pode exigir scope/métricas */
  }

  type ExpandedLandingRow = {
    campaign?: { id?: string; name?: string };
    expandedLandingPageView?: { expandedFinalUrl?: string };
  };
  try {
    const rows = await googleAdsSearch<ExpandedLandingRow>(
      accessToken,
      cid,
      `SELECT campaign.id, campaign.name, expanded_landing_page_view.expanded_final_url ` +
        `FROM expanded_landing_page_view ` +
        `WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'`,
      loginCustomerId,
    );
    for (const row of rows) {
      addUrls(String(row.campaign?.id ?? ""), row.campaign?.name ?? "", [
        row.expandedLandingPageView?.expandedFinalUrl,
      ]);
    }
  } catch {
    /* expanded opcional */
  }

  return [...byCampaign.entries()].map(([campaignId, v]) => ({
    campaignId,
    campaignName: v.name,
    landingUrls: [...v.urls],
  }));
}


