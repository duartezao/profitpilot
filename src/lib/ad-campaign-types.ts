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
  impressions: number;
  clicks: number;
  currency: string;
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;
};

export type StoreCampaignsView = {
  storeId: string;
  dateKey: string;
  dateLabel: string;
  hasLinkedAccounts: boolean;
  source: "live" | "cache" | "mixed";
  syncedAt: string | null;
  campaigns: LiveCampaignRow[];
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
