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
  type LiveCampaignRow,
} from "@/lib/ad-campaign-types";

/** Versão REST da Google Ads API — v17 está obsoleta; usar v23+ (2026). */
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v23";
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${API_VERSION}`;

export type GoogleAdAccountOption = {
  id: string;
  name: string;
  currency: string;
};

export class GoogleAdsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
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
    const msg = e instanceof GoogleAdsApiError ? e.message : "Erro desconhecido.";
    if (msg.toLowerCase().includes("test account")) {
      return {
        ok: false,
        error:
          "Developer token em modo Test — só funciona com contas de teste. Pede acesso Basic/Standard no Google Ads API Center.",
      };
    }
    if (msg.includes("UNAUTHENTICATED") || msg.includes("developer-token")) {
      return {
        ok: false,
        error: `Developer token rejeitado pela Google: ${msg}`,
      };
    }
    if (msg.includes("PERMISSION_DENIED")) {
      return {
        ok: false,
        error: `Sem permissão na conta Google Ads — confirma que o Gmail OAuth tem acesso ao Customer ID: ${msg}`,
      };
    }
    return { ok: false, error: msg };
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

async function googleAdsSearch<T>(
  accessToken: string,
  customerId: string,
  query: string,
): Promise<T[]> {
  const { developerToken } = requireGoogleApiEnv();
  const cid = normalizeCustomerId(customerId);
  const res = await fetch(`${GOOGLE_ADS_BASE}/customers/${cid}/googleAds:search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  const json = (await res.json()) as {
    results?: T[];
    error?: { message?: string; status?: string };
  };
  if (!res.ok) {
    throw new GoogleAdsApiError(
      json.error?.message ?? `Google Ads API HTTP ${res.status}`,
    );
  }
  return json.results ?? [];
}

/** Lista customers acessíveis com o refresh token. */
export async function listGoogleAdAccounts(
  refreshToken: string,
): Promise<GoogleAdAccountOption[]> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
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
    throw new GoogleAdsApiError(
      json.error?.message ?? "Não foi possível listar contas Google Ads.",
    );
  }

  const accounts: GoogleAdAccountOption[] = [];
  for (const resource of json.resourceNames ?? []) {
    const id = resource.replace("customers/", "");
    try {
      const rows = await googleAdsSearch<{
        customer?: { descriptiveName?: string; currencyCode?: string };
      }>(
        accessToken,
        id,
        "SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1",
      );
      const row = rows[0]?.customer;
      accounts.push({
        id,
        name: row?.descriptiveName?.trim() || `Conta ${id}`,
        currency: row?.currencyCode ?? "USD",
      });
    } catch {
      accounts.push({
        id,
        name: `Conta ${id}`,
        currency: "USD",
      });
    }
  }
  return accounts.sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

export async function verifyGoogleAdAccountAccess(
  refreshToken: string,
  customerId: string,
): Promise<{ name: string; currency: string }> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const rows = await googleAdsSearch<{
    customer?: { descriptiveName?: string; currencyCode?: string };
  }>(
    accessToken,
    customerId,
    "SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1",
  );
  const row = rows[0]?.customer;
  if (!row) {
    throw new GoogleAdsApiError("Conta Google Ads não encontrada ou sem acesso.");
  }
  return {
    name: row.descriptiveName?.trim() || normalizeCustomerId(customerId),
    currency: row.currencyCode ?? "USD",
  };
}

/** Gasto num único dia (segments.date). */
export async function fetchGoogleAdSpendForDay(
  refreshToken: string,
  customerId: string,
  dateKey: string,
): Promise<{ spend: number; currency: string }> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const rows = await googleAdsSearch<{
    metrics?: { costMicros?: string };
    customer?: { currencyCode?: string };
  }>(
    accessToken,
    customerId,
    `SELECT metrics.cost_micros, customer.currency_code FROM customer WHERE segments.date = '${dateKey}'`,
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
  );
  const row = rows[0];
  const micros = Number(row?.metrics?.costMicros ?? 0);
  const spend = Number.isFinite(micros) ? micros / 1_000_000 : 0;
  return {
    spend,
    impressions: Number(row?.metrics?.impressions ?? 0) || 0,
    clicks: Number(row?.metrics?.clicks ?? 0) || 0,
    currency: row?.customer?.currencyCode ?? "USD",
  };
}

export type CampaignInsightsRow = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  currency: string;
};

/** Insights por campanha num dia. */
export async function fetchGoogleCampaignInsightsForDay(
  refreshToken: string,
  customerId: string,
  dateKey: string,
): Promise<CampaignInsightsRow[]> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const rows = await googleAdsSearch<{
    campaign?: { id?: string; name?: string };
    metrics?: {
      costMicros?: string;
      impressions?: string;
      clicks?: string;
    };
    customer?: { currencyCode?: string };
  }>(
    accessToken,
    customerId,
    `SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, customer.currency_code FROM campaign WHERE segments.date = '${dateKey}'`,
  );

  const out: CampaignInsightsRow[] = [];
  for (const row of rows) {
    const micros = Number(row?.metrics?.costMicros ?? 0);
    const spend = Number.isFinite(micros) ? micros / 1_000_000 : 0;
    const impressions = Number(row?.metrics?.impressions ?? 0) || 0;
    const clicks = Number(row?.metrics?.clicks ?? 0) || 0;
    if (spend <= 0 && impressions <= 0 && clicks <= 0) continue;
    out.push({
      campaignId: String(row?.campaign?.id ?? "").trim() || "unknown",
      campaignName: row?.campaign?.name?.trim() || "Campanha",
      spend,
      impressions,
      clicks,
      currency: row?.customer?.currencyCode ?? "USD",
    });
  }
  return out;
}

/** Campanhas activas/pausadas com métricas de hoje. */
export async function fetchGoogleLiveCampaigns(
  refreshToken: string,
  customerId: string,
  dateKey: string,
): Promise<LiveCampaignRow[]> {
  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const cid = normalizeCustomerId(customerId);

  const statusRows = await googleAdsSearch<{
    campaign?: { id?: string; name?: string; status?: string };
  }>(
    accessToken,
    cid,
    `SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.status IN ('ENABLED', 'PAUSED')`,
  );

  const metricsRows = await googleAdsSearch<{
    campaign?: { id?: string };
    metrics?: {
      costMicros?: string;
      impressions?: string;
      clicks?: string;
    };
    customer?: { currencyCode?: string };
  }>(
    accessToken,
    cid,
    `SELECT campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks, customer.currency_code FROM campaign WHERE segments.date = '${dateKey}'`,
  );

  const metricsById = new Map<
    string,
    { spend: number; impressions: number; clicks: number; currency: string }
  >();
  let currency = "USD";
  for (const row of metricsRows) {
    const id = String(row?.campaign?.id ?? "").trim();
    if (!id) continue;
    if (row?.customer?.currencyCode) currency = row.customer.currencyCode;
    const micros = Number(row?.metrics?.costMicros ?? 0);
    metricsById.set(id, {
      spend: Number.isFinite(micros) ? micros / 1_000_000 : 0,
      impressions: Number(row?.metrics?.impressions ?? 0) || 0,
      clicks: Number(row?.metrics?.clicks ?? 0) || 0,
      currency: row?.customer?.currencyCode ?? currency,
    });
  }

  const out: LiveCampaignRow[] = [];
  const seen = new Set<string>();

  for (const row of statusRows) {
    const id = String(row?.campaign?.id ?? "").trim();
    const status = row?.campaign?.status?.trim() || "UNKNOWN";
    if (!id) continue;
    const m = metricsById.get(id);
    if (status !== "ENABLED" && !m) continue;

    const spend = m?.spend ?? 0;
    const impressions = m?.impressions ?? 0;
    const clicks = m?.clicks ?? 0;
    out.push({
      campaignId: id,
      campaignName: row?.campaign?.name?.trim() || `Campanha ${id}`,
      platform: "google",
      platformLabel: "Google",
      adAccountId: cid,
      adAccountName: cid,
      status,
      statusLabel: formatCampaignStatusLabel(status),
      spend,
      impressions,
      clicks,
      currency: m?.currency ?? currency,
      ...metricsFromCampaignTotals(spend, impressions, clicks),
    });
    seen.add(id);
  }

  for (const [id, m] of metricsById) {
    if (seen.has(id)) continue;
    out.push({
      campaignId: id,
      campaignName: `Campanha ${id}`,
      platform: "google",
      platformLabel: "Google",
      adAccountId: cid,
      adAccountName: cid,
      status: "ENABLED",
      statusLabel: "Activa",
      spend: m.spend,
      impressions: m.impressions,
      clicks: m.clicks,
      currency: m.currency,
      ...metricsFromCampaignTotals(m.spend, m.impressions, m.clicks),
    });
  }

  return out.sort((a, b) => b.spend - a.spend);
}
