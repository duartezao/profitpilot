import type { AdPlatform } from "@/lib/ad-spend-platforms";

export type LiveCampaignRow = {
  campaignId: string;
  campaignName: string;
  platform: AdPlatform;
  platformLabel: string;
  adAccountId: string;
  adAccountName: string;
  status: string;
  statusLabel: string;
  spend: number;
  /** Gasto reportado pela plataforma (sem fees da conta API). */
  spendPlatform?: number;
  /** Moeda original da conta ads (antes de FX). */
  inputCurrency?: string;
  /** Gasto total na moeda original (com fees). */
  spendInput?: number;
  /** Gasto API na moeda original. */
  spendPlatformInput?: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  roas: number | null;
  currency: string;
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;
};

export type CampaignPeriodTotals = {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversionValue: number;
  roas: number | null;
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;
  currency: string;
};

export type StoreCampaignsView = {
  storeId: string;
  periodKey: string;
  dateKey: string;
  dateFrom: string;
  dateTo: string;
  dateLabel: string;
  daysInPeriod: number;
  daysWithData: number;
  displayCurrency: string;
  fxDateKey: string;
  hasLinkedAccounts: boolean;
  includesToday: boolean;
  source: "live" | "cache" | "mixed";
  syncedAt: string | null;
  campaigns: LiveCampaignRow[];
  totals: CampaignPeriodTotals;
  errors: string[];
};

export function metricsFromCampaignTotals(
  spend: number,
  impressions: number,
  clicks: number,
): { cpc: number | null; ctr: number | null; cpm: number | null } {
  return {
    cpc: clicks > 0 ? spend / clicks : null,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}

export function roasFromCampaign(spend: number, conversionValue: number): number | null {
  if (spend <= 0 || conversionValue <= 0) return null;
  return Math.round((conversionValue / spend) * 100) / 100;
}

export function aggregateCampaignPeriodTotals(
  campaigns: LiveCampaignRow[],
  currency: string,
): CampaignPeriodTotals {
  const spend = campaigns.reduce((s, c) => s + c.spend, 0);
  const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const impressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const conversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const conversionValue = campaigns.reduce((s, c) => s + c.conversionValue, 0);
  const m = metricsFromCampaignTotals(spend, impressions, clicks);
  return {
    spend,
    clicks,
    impressions,
    conversions,
    conversionValue,
    roas: roasFromCampaign(spend, conversionValue),
    currency,
    ...m,
  };
}

export function formatCampaignStatusLabel(status: string): string {
  const s = status.trim().toUpperCase();
  if (
    s === "ACTIVE" ||
    s === "ENABLED" ||
    s === "ENABLE" ||
    s === "STATUS_ENABLE" ||
    s === "CAMPAIGN_STATUS_ENABLE"
  ) {
    return "Activa";
  }
  if (
    s === "PAUSED" ||
    s === "DISABLE" ||
    s === "STATUS_DISABLE" ||
    s === "CAMPAIGN_STATUS_DISABLE"
  ) {
    return "Pausada";
  }
  if (s === "REMOVED" || s === "DELETE" || s === "DELETED") {
    return "Removida";
  }
  if (s === "UNKNOWN" || s === "UNSPECIFIED" || s === "—") {
    return "—";
  }
  return status;
}

export type CampaignDayMetricsSlice = {
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
};

export function isActiveCampaignStatus(status: string): boolean {
  const s = status.trim().toUpperCase();
  return (
    s === "ACTIVE" ||
    s === "ENABLED" ||
    s === "ENABLE" ||
    s === "STATUS_ENABLE" ||
    s === "CAMPAIGN_STATUS_ENABLE"
  );
}

export function isPausedCampaignStatus(status: string): boolean {
  const s = status.trim().toUpperCase();
  return (
    s === "PAUSED" ||
    s === "DISABLE" ||
    s === "STATUS_DISABLE" ||
    s === "CAMPAIGN_STATUS_DISABLE" ||
    s === "CAMPAIGN_PAUSED"
  );
}

export function campaignDayHasMetrics(
  metrics?: CampaignDayMetricsSlice | null,
): boolean {
  if (!metrics) return false;
  return (
    (metrics.spend ?? 0) > 0 ||
    (metrics.impressions ?? 0) > 0 ||
    (metrics.clicks ?? 0) > 0 ||
    (metrics.conversions ?? 0) > 0
  );
}

/** Activa: sempre no dia. Pausada: só se houve actividade nesse dia. */
export function shouldIncludeCampaignForDay(
  status: string,
  metrics?: CampaignDayMetricsSlice | null,
): boolean {
  if (isActiveCampaignStatus(status)) return true;
  if (isPausedCampaignStatus(status)) return campaignDayHasMetrics(metrics);
  return campaignDayHasMetrics(metrics);
}
