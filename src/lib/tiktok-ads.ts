/**
 * TikTok Marketing API — advertiser spend.
 * @see https://business-api.tiktok.com/portal/docs
 *
 * Por conta: access token + advertiser ID.
 * Servidor (listagem): TIKTOK_APP_ID, TIKTOK_APP_SECRET.
 */

import {
  formatCampaignStatusLabel,
  metricsFromCampaignTotals,
  type LiveCampaignRow,
} from "@/lib/ad-campaign-types";

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";

export type TiktokAdvertiserOption = {
  id: string;
  name: string;
  currency: string;
};

export class TiktokAdsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TiktokAdsApiError";
  }
}

function requireTiktokEnv() {
  const appId = process.env.TIKTOK_APP_ID?.trim();
  const appSecret = process.env.TIKTOK_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new TiktokAdsApiError(
      "TikTok API não configurada no servidor (TIKTOK_APP_ID, TIKTOK_APP_SECRET).",
    );
  }
  return { appId, appSecret };
}

function normalizeAdvertiserId(id: string): string {
  const t = id.trim();
  if (!/^\d+$/.test(t)) {
    throw new TiktokAdsApiError("Advertiser ID inválido (apenas dígitos).");
  }
  return t;
}

type TiktokEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
};

async function tiktokGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${TIKTOK_API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { "Access-Token": accessToken },
    cache: "no-store",
  });
  const json = (await res.json()) as TiktokEnvelope<T>;
  if (!res.ok || json.code !== 0) {
    throw new TiktokAdsApiError(json.message ?? `TikTok API HTTP ${res.status}`);
  }
  if (json.data === undefined) {
    throw new TiktokAdsApiError("Resposta TikTok vazia.");
  }
  return json.data;
}

/** Lista advertisers acessíveis com o token. */
export async function listTiktokAdvertisers(
  accessToken: string,
): Promise<TiktokAdvertiserOption[]> {
  const { appId, appSecret } = requireTiktokEnv();
  const data = await tiktokGet<{
    list?: Array<{
      advertiser_id: string;
      advertiser_name?: string;
      currency?: string;
    }>;
  }>("/oauth2/advertiser/get/", accessToken, {
    app_id: appId,
    secret: appSecret,
  });

  return (data.list ?? []).map((a) => ({
    id: String(a.advertiser_id),
    name: a.advertiser_name?.trim() || `Advertiser ${a.advertiser_id}`,
    currency: a.currency ?? "USD",
  }));
}

export async function verifyTiktokAdvertiserAccess(
  accessToken: string,
  advertiserId: string,
): Promise<{ name: string; currency: string }> {
  const id = normalizeAdvertiserId(advertiserId);
  const advertisers = await listTiktokAdvertisers(accessToken);
  const match = advertisers.find((a) => a.id === id);
  if (!match) {
    throw new TiktokAdsApiError(
      "Advertiser não encontrado — confirma o token e o ID.",
    );
  }
  return { name: match.name, currency: match.currency };
}

/** Gasto num único dia ao nível do advertiser. */
export async function fetchTiktokAdSpendForDay(
  accessToken: string,
  advertiserId: string,
  dateKey: string,
): Promise<{ spend: number; currency: string }> {
  const id = normalizeAdvertiserId(advertiserId);
  const data = await tiktokGet<{
    list?: Array<{ metrics?: { spend?: string }; dimensions?: { currency?: string } }>;
  }>("/report/integrated/get/", accessToken, {
    advertiser_id: id,
    report_type: "BASIC",
    data_level: "AUCTION_ADVERTISER",
    dimensions: JSON.stringify(["stat_time_day"]),
    metrics: JSON.stringify(["spend"]),
    start_date: dateKey,
    end_date: dateKey,
    page_size: "1",
  });

  const row = data.list?.[0];
  const spend = Number(row?.metrics?.spend ?? 0);
  return {
    spend: Number.isFinite(spend) ? spend : 0,
    currency: row?.dimensions?.currency ?? "USD",
  };
}

export type TiktokAdInsightsDay = {
  spend: number;
  impressions: number;
  clicks: number;
  currency: string;
};

export async function fetchTiktokAdInsightsForDay(
  accessToken: string,
  advertiserId: string,
  dateKey: string,
): Promise<TiktokAdInsightsDay> {
  const id = normalizeAdvertiserId(advertiserId);
  const data = await tiktokGet<{
    list?: Array<{
      metrics?: { spend?: string; impressions?: string; clicks?: string };
      dimensions?: { currency?: string };
    }>;
  }>("/report/integrated/get/", accessToken, {
    advertiser_id: id,
    report_type: "BASIC",
    data_level: "AUCTION_ADVERTISER",
    dimensions: JSON.stringify(["stat_time_day"]),
    metrics: JSON.stringify(["spend", "impressions", "clicks"]),
    start_date: dateKey,
    end_date: dateKey,
    page_size: "1",
  });

  const row = data.list?.[0];
  const spend = Number(row?.metrics?.spend ?? 0);
  return {
    spend: Number.isFinite(spend) ? spend : 0,
    impressions: Number(row?.metrics?.impressions ?? 0) || 0,
    clicks: Number(row?.metrics?.clicks ?? 0) || 0,
    currency: row?.dimensions?.currency ?? "USD",
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
export async function fetchTiktokCampaignInsightsForDay(
  accessToken: string,
  advertiserId: string,
  dateKey: string,
): Promise<CampaignInsightsRow[]> {
  const id = normalizeAdvertiserId(advertiserId);
  const data = await tiktokGet<{
    list?: Array<{
      metrics?: { spend?: string; impressions?: string; clicks?: string };
      dimensions?: { campaign_id?: string; currency?: string };
    }>;
  }>("/report/integrated/get/", accessToken, {
    advertiser_id: id,
    report_type: "BASIC",
    data_level: "AUCTION_CAMPAIGN",
    dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
    metrics: JSON.stringify(["spend", "impressions", "clicks"]),
    start_date: dateKey,
    end_date: dateKey,
    page_size: "100",
  });

  const out: CampaignInsightsRow[] = [];
  for (const row of data.list ?? []) {
    const spend = Number(row?.metrics?.spend ?? 0) || 0;
    const impressions = Number(row?.metrics?.impressions ?? 0) || 0;
    const clicks = Number(row?.metrics?.clicks ?? 0) || 0;
    if (spend <= 0 && impressions <= 0 && clicks <= 0) continue;
    out.push({
      campaignId: String(row?.dimensions?.campaign_id ?? "").trim() || "unknown",
      campaignName: `Campanha ${row?.dimensions?.campaign_id ?? ""}`.trim(),
      spend,
      impressions,
      clicks,
      currency: row?.dimensions?.currency ?? "USD",
    });
  }
  return out;
}

/** Campanhas activas com métricas de hoje. */
export async function fetchTiktokLiveCampaigns(
  accessToken: string,
  advertiserId: string,
  dateKey: string,
): Promise<LiveCampaignRow[]> {
  const id = normalizeAdvertiserId(advertiserId);

  const campaignData = await tiktokGet<{
    list?: Array<{
      campaign_id?: string;
      campaign_name?: string;
      operation_status?: string;
      secondary_status?: string;
    }>;
  }>("/campaign/get/", accessToken, {
    advertiser_id: id,
    page: "1",
    page_size: "100",
  });

  const metricsData = await tiktokGet<{
    list?: Array<{
      metrics?: { spend?: string; impressions?: string; clicks?: string };
      dimensions?: { campaign_id?: string; currency?: string };
    }>;
  }>("/report/integrated/get/", accessToken, {
    advertiser_id: id,
    report_type: "BASIC",
    data_level: "AUCTION_CAMPAIGN",
    dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
    metrics: JSON.stringify(["spend", "impressions", "clicks"]),
    start_date: dateKey,
    end_date: dateKey,
    page_size: "100",
  });

  const metricsById = new Map<
    string,
    { spend: number; impressions: number; clicks: number; currency: string }
  >();
  for (const row of metricsData.list ?? []) {
    const cid = String(row?.dimensions?.campaign_id ?? "").trim();
    if (!cid) continue;
    metricsById.set(cid, {
      spend: Number(row?.metrics?.spend ?? 0) || 0,
      impressions: Number(row?.metrics?.impressions ?? 0) || 0,
      clicks: Number(row?.metrics?.clicks ?? 0) || 0,
      currency: row?.dimensions?.currency ?? "USD",
    });
  }

  const out: LiveCampaignRow[] = [];
  const seen = new Set<string>();

  for (const c of campaignData.list ?? []) {
    const cid = String(c.campaign_id ?? "").trim();
    if (!cid) continue;
    const status = c.operation_status?.trim() || c.secondary_status?.trim() || "UNKNOWN";
    const m = metricsById.get(cid);
    const isRunning =
      status === "ENABLE" || status === "STATUS_ENABLE" || status === "CAMPAIGN_STATUS_ENABLE";
    if (!isRunning && !m) continue;

    const spend = m?.spend ?? 0;
    const impressions = m?.impressions ?? 0;
    const clicks = m?.clicks ?? 0;
    out.push({
      campaignId: cid,
      campaignName: c.campaign_name?.trim() || `Campanha ${cid}`,
      platform: "tiktok",
      platformLabel: "TikTok",
      adAccountId: id,
      adAccountName: id,
      status,
      statusLabel: formatCampaignStatusLabel(status),
      spend,
      impressions,
      clicks,
      currency: m?.currency ?? "USD",
      ...metricsFromCampaignTotals(spend, impressions, clicks),
    });
    seen.add(cid);
  }

  for (const [cid, m] of metricsById) {
    if (seen.has(cid)) continue;
    out.push({
      campaignId: cid,
      campaignName: `Campanha ${cid}`,
      platform: "tiktok",
      platformLabel: "TikTok",
      adAccountId: id,
      adAccountName: id,
      status: "ENABLE",
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
