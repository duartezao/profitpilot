/**
 * Meta Marketing API — Ads Insights & ad accounts.
 * @see https://developers.facebook.com/docs/marketing-api/insights
 * @see https://developers.facebook.com/docs/marketing-api/reference/ad-account
 *
 * Permissão necessária: `ads_read` (token de utilizador ou System User do Business Manager).
 */

import {
  formatCampaignStatusLabel,
  metricsFromCampaignTotals,
  type LiveCampaignRow,
} from "@/lib/ad-campaign-types";

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v25.0";
const META_GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type MetaAdAccountOption = {
  /** ID Graph API (ex. act_123456789) */
  id: string;
  accountId: string;
  name: string;
  currency: string;
  accountStatus: number;
};

type MetaErrorBody = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export class MetaApiError extends Error {
  readonly code?: number;
  readonly subcode?: number;

  constructor(error: MetaErrorBody) {
    super(formatMetaErrorMessage(error));
    this.name = "MetaApiError";
    this.code = error.code;
    this.subcode = error.error_subcode;
  }
}

function formatMetaErrorMessage(error: MetaErrorBody): string {
  const base = error.message ?? "Erro da Meta Marketing API";
  switch (error.code) {
    case 190:
      return `Token inválido ou expirado — gera um novo no Business Manager (System User com ads_read). Detalhe: ${base}`;
    case 200:
      return `Sem permissão nesta ad account — confirma ads_read e que o System User tem acesso à conta. Detalhe: ${base}`;
    case 100:
      return `Pedido inválido — verifica o ID da conta (act_…). Detalhe: ${base}`;
    case 17:
      return `Limite de pedidos da Meta API — tenta de novo dentro de alguns minutos.`;
    default:
      return base;
  }
}

export function normalizeActId(id: string): string {
  const t = id.trim();
  if (t.startsWith("act_")) return t;
  const digits = t.replace(/\D/g, "");
  if (!digits) throw new MetaApiError({ message: "ID de ad account inválido.", code: 100 });
  return `act_${digits}`;
}

async function metaGraphGet<T>(
  pathOrUrl: string,
  accessToken: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = pathOrUrl.startsWith("http")
    ? new URL(pathOrUrl)
    : new URL(`${META_GRAPH}/${pathOrUrl.replace(/^\//, "")}`);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const json = (await res.json()) as T & { error?: MetaErrorBody };
  if (!res.ok || json.error) {
    throw new MetaApiError(json.error ?? { message: `HTTP ${res.status}` });
  }
  return json;
}

/** Lista ad accounts acessíveis com o token (me/adaccounts). */
export async function listMetaAdAccounts(
  accessToken: string,
): Promise<MetaAdAccountOption[]> {
  type AdAccountPage = {
    data?: Array<{
      id: string;
      account_id: string;
      name?: string;
      account_status?: number;
      currency?: string;
    }>;
    paging?: { next?: string };
  };

  const accounts: MetaAdAccountOption[] = [];
  let nextUrl: string | null = null;
  let first = true;

  while (first || nextUrl) {
    first = false;
    const json: AdAccountPage = nextUrl
      ? await metaGraphGet<AdAccountPage>(nextUrl, accessToken)
      : await metaGraphGet<AdAccountPage>("me/adaccounts", accessToken, {
          fields: "account_id,name,account_status,currency,id",
          limit: "100",
        });

    for (const row of json.data ?? []) {
      accounts.push({
        id: row.id.startsWith("act_") ? row.id : `act_${row.account_id}`,
        accountId: row.account_id,
        name: row.name?.trim() || `Conta ${row.account_id}`,
        currency: row.currency ?? "USD",
        accountStatus: row.account_status ?? 0,
      });
    }

    nextUrl = json.paging?.next ?? null;
  }

  return accounts.sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

/** Confirma que o token consegue ler a ad account antes de guardar. */
export async function verifyMetaAdAccountAccess(
  accessToken: string,
  adAccountId: string,
): Promise<{ name: string; currency: string; accountStatus: number }> {
  const actId = normalizeActId(adAccountId);
  const json = await metaGraphGet<{
    name?: string;
    currency?: string;
    account_status?: number;
  }>(actId, accessToken, {
    fields: "name,currency,account_status",
  });

  return {
    name: json.name?.trim() || actId,
    currency: json.currency ?? "USD",
    accountStatus: json.account_status ?? 0,
  };
}

/**
 * Gasto da conta num único dia (time_range since=until).
 * Moeda devolvida em account_currency (conversão para base na camada de ad spend).
 */
export async function fetchMetaAdSpendForDay(
  accessToken: string,
  adAccountId: string,
  dateKey: string,
): Promise<{ spend: number; currency: string }> {
  const actId = normalizeActId(adAccountId);
  const json = await metaGraphGet<{
    data?: Array<{ spend?: string; account_currency?: string }>;
  }>(`${actId}/insights`, accessToken, {
    fields: "spend,account_currency",
    time_range: JSON.stringify({ since: dateKey, until: dateKey }),
    level: "account",
    time_increment: "1",
  });

  const row = json.data?.[0];
  const spend = Number(row?.spend ?? 0);
  const currency = row?.account_currency ?? "USD";
  return { spend: Number.isFinite(spend) ? spend : 0, currency };
}

export type MetaAdInsightsDay = {
  spend: number;
  impressions: number;
  clicks: number;
  currency: string;
};

/** Insights da conta num dia (CPC/CTR/CPM quando disponíveis na API). */
export async function fetchMetaAdInsightsForDay(
  accessToken: string,
  adAccountId: string,
  dateKey: string,
): Promise<MetaAdInsightsDay> {
  const actId = normalizeActId(adAccountId);
  const json = await metaGraphGet<{
    data?: Array<{
      spend?: string;
      impressions?: string;
      clicks?: string;
      account_currency?: string;
    }>;
  }>(`${actId}/insights`, accessToken, {
    fields: "spend,impressions,clicks,account_currency",
    time_range: JSON.stringify({ since: dateKey, until: dateKey }),
    level: "account",
    time_increment: "1",
  });

  const row = json.data?.[0];
  return {
    spend: Number(row?.spend ?? 0) || 0,
    impressions: Number(row?.impressions ?? 0) || 0,
    clicks: Number(row?.clicks ?? 0) || 0,
    currency: row?.account_currency ?? "USD",
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
export async function fetchMetaCampaignInsightsForDay(
  accessToken: string,
  adAccountId: string,
  dateKey: string,
): Promise<CampaignInsightsRow[]> {
  const actId = normalizeActId(adAccountId);
  type InsightsPage = {
    data?: Array<{
      campaign_id?: string;
      campaign_name?: string;
      spend?: string;
      impressions?: string;
      clicks?: string;
      account_currency?: string;
    }>;
    paging?: { next?: string };
  };

  const rows: CampaignInsightsRow[] = [];
  let nextUrl: string | null = null;
  let first = true;

  while (first || nextUrl) {
    first = false;
    const json: InsightsPage = nextUrl
      ? await metaGraphGet<InsightsPage>(nextUrl, accessToken)
      : await metaGraphGet<InsightsPage>(`${actId}/insights`, accessToken, {
          fields:
            "campaign_id,campaign_name,spend,impressions,clicks,account_currency",
          time_range: JSON.stringify({ since: dateKey, until: dateKey }),
          level: "campaign",
          limit: "100",
        });

    for (const row of json.data ?? []) {
      const spend = Number(row.spend ?? 0) || 0;
      const impressions = Number(row.impressions ?? 0) || 0;
      const clicks = Number(row.clicks ?? 0) || 0;
      if (spend <= 0 && impressions <= 0 && clicks <= 0) continue;
      rows.push({
        campaignId: String(row.campaign_id ?? "").trim() || "unknown",
        campaignName: row.campaign_name?.trim() || "Campanha",
        spend,
        impressions,
        clicks,
        currency: row.account_currency ?? "USD",
      });
    }
    nextUrl = json.paging?.next ?? null;
  }

  return rows;
}

/** Campanhas activas/pausadas com métricas de hoje. */
export async function fetchMetaLiveCampaigns(
  accessToken: string,
  adAccountId: string,
  dateKey: string,
): Promise<LiveCampaignRow[]> {
  const actId = normalizeActId(adAccountId);
  type CampaignPage = {
    data?: Array<{
      id?: string;
      name?: string;
      status?: string;
      effective_status?: string;
    }>;
    paging?: { next?: string };
  };

  const campaignsById = new Map<
    string,
    { name: string; status: string }
  >();
  let nextUrl: string | null = null;
  let first = true;

  while (first || nextUrl) {
    first = false;
    const json: CampaignPage = nextUrl
      ? await metaGraphGet<CampaignPage>(nextUrl, accessToken)
      : await metaGraphGet<CampaignPage>(`${actId}/campaigns`, accessToken, {
          fields: "id,name,status,effective_status",
          limit: "100",
        });

    for (const c of json.data ?? []) {
      const id = String(c.id ?? "").trim();
      if (!id) continue;
      campaignsById.set(id, {
        name: c.name?.trim() || "Campanha",
        status: c.effective_status?.trim() || c.status?.trim() || "UNKNOWN",
      });
    }
    nextUrl = json.paging?.next ?? null;
  }

  const metricsById = new Map<
    string,
    { spend: number; impressions: number; clicks: number; currency: string; name: string }
  >();

  type InsightsPage = {
    data?: Array<{
      campaign_id?: string;
      campaign_name?: string;
      spend?: string;
      impressions?: string;
      clicks?: string;
      account_currency?: string;
    }>;
    paging?: { next?: string };
  };

  nextUrl = null;
  first = true;
  while (first || nextUrl) {
    first = false;
    const json: InsightsPage = nextUrl
      ? await metaGraphGet<InsightsPage>(nextUrl, accessToken)
      : await metaGraphGet<InsightsPage>(`${actId}/insights`, accessToken, {
          fields:
            "campaign_id,campaign_name,spend,impressions,clicks,account_currency",
          time_range: JSON.stringify({ since: dateKey, until: dateKey }),
          level: "campaign",
          limit: "100",
        });

    for (const row of json.data ?? []) {
      const id = String(row.campaign_id ?? "").trim();
      if (!id) continue;
      metricsById.set(id, {
        spend: Number(row.spend ?? 0) || 0,
        impressions: Number(row.impressions ?? 0) || 0,
        clicks: Number(row.clicks ?? 0) || 0,
        currency: row.account_currency ?? "USD",
        name: row.campaign_name?.trim() || "Campanha",
      });
    }
    nextUrl = json.paging?.next ?? null;
  }

  const out: LiveCampaignRow[] = [];
  const seen = new Set<string>();

  for (const [id, c] of campaignsById) {
    const isRunning = c.status === "ACTIVE";
    const m = metricsById.get(id);
    if (!isRunning && !m) continue;
    if (c.status !== "ACTIVE" && c.status !== "PAUSED" && !m) continue;

    const spend = m?.spend ?? 0;
    const impressions = m?.impressions ?? 0;
    const clicks = m?.clicks ?? 0;
    out.push({
      campaignId: id,
      campaignName: c.name || m?.name || "Campanha",
      platform: "meta",
      platformLabel: "Meta",
      adAccountId: actId,
      adAccountName: actId,
      status: c.status,
      statusLabel: formatCampaignStatusLabel(c.status),
      spend,
      impressions,
      clicks,
      currency: m?.currency ?? "USD",
      ...metricsFromCampaignTotals(spend, impressions, clicks),
    });
    seen.add(id);
  }

  for (const [id, m] of metricsById) {
    if (seen.has(id)) continue;
    out.push({
      campaignId: id,
      campaignName: m.name,
      platform: "meta",
      platformLabel: "Meta",
      adAccountId: actId,
      adAccountName: actId,
      status: "ACTIVE",
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
