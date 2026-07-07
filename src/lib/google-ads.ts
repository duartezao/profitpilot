/**
 * Google Ads API — daily spend via GAQL.
 * @see https://developers.google.com/google-ads/api/docs/start
 *
 * Por conta: refresh token OAuth + customer ID (10 dígitos).
 * Servidor: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET.
 */

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION ?? "v17";
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

function requireGoogleEnv() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  if (!developerToken || !clientId || !clientSecret) {
    throw new GoogleAdsApiError(
      "Google Ads API não configurada no servidor (GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET).",
    );
  }
  return { developerToken, clientId, clientSecret };
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
  const { clientId, clientSecret } = requireGoogleEnv();
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
  const { developerToken } = requireGoogleEnv();
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
  const { developerToken } = requireGoogleEnv();
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
