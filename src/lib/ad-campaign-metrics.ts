import "server-only";
import mongoose from "mongoose";
import { AdCampaignDay } from "@/models/AdCampaignDay";
import type { AdPlatform } from "@/lib/ad-spend-platforms";
import { AD_PLATFORM_LABELS } from "@/lib/ad-spend-platforms";

export type PlatformAdMetrics = {
  platform: AdPlatform;
  platformLabel: string;
  spend: number;
  impressions: number;
  clicks: number;
  currency: string;
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;
};

export type CampaignDayMetrics = {
  campaignId: string;
  campaignName: string;
  platform: AdPlatform;
  platformLabel: string;
  spend: number;
  impressions: number;
  clicks: number;
  currency: string;
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;
};

export type StoreAdMetricsBundle = {
  total: {
    spend: number;
    impressions: number;
    clicks: number;
    cpc: number | null;
    ctr: number | null;
    cpm: number | null;
  };
  byPlatform: PlatformAdMetrics[];
  campaigns: CampaignDayMetrics[];
};

function metricsFromTotals(
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

function mapCampaignRow(r: {
  campaignId: string;
  campaignName?: string | null;
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  currency?: string | null;
}): CampaignDayMetrics {
  const platform = r.platform as AdPlatform;
  const m = metricsFromTotals(r.spend, r.impressions, r.clicks);
  return {
    campaignId: r.campaignId,
    campaignName: r.campaignName?.trim() || "Campanha",
    platform,
    platformLabel: AD_PLATFORM_LABELS[platform] ?? r.platform,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    currency: r.currency ?? "USD",
    ...m,
  };
}

/** Lê métricas sincronizadas (campanhas + totais por plataforma) a partir da BD. */
export async function loadStoreAdMetricsFromDb(
  storeId: string,
  dateKeys: string[],
): Promise<StoreAdMetricsBundle | null> {
  if (!dateKeys.length) return null;
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const rows = await AdCampaignDay.find({
    storeId: storeOid,
    dateKey: { $in: dateKeys },
  })
    .select(
      "campaignId campaignName platform spend impressions clicks currency dateKey",
    )
    .lean();

  if (!rows.length) return null;

  const byCampaignKey = new Map<
    string,
    {
      campaignId: string;
      campaignName: string;
      platform: string;
      spend: number;
      impressions: number;
      clicks: number;
      currency: string;
    }
  >();

  for (const r of rows) {
    const key = `${r.platform}:${r.campaignId}`;
    const prev = byCampaignKey.get(key);
    if (!prev) {
      byCampaignKey.set(key, {
        campaignId: r.campaignId,
        campaignName: r.campaignName ?? "",
        platform: r.platform,
        spend: r.spend ?? 0,
        impressions: r.impressions ?? 0,
        clicks: r.clicks ?? 0,
        currency: r.currency ?? "USD",
      });
    } else {
      prev.spend += r.spend ?? 0;
      prev.impressions += r.impressions ?? 0;
      prev.clicks += r.clicks ?? 0;
    }
  }

  const campaigns = [...byCampaignKey.values()]
    .map(mapCampaignRow)
    .filter((c) => c.spend > 0 || c.impressions > 0 || c.clicks > 0)
    .sort((a, b) => b.spend - a.spend);

  const platformAgg = new Map<
    AdPlatform,
    { spend: number; impressions: number; clicks: number; currency: string }
  >();

  for (const c of campaigns) {
    const prev = platformAgg.get(c.platform) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      currency: c.currency,
    };
    prev.spend += c.spend;
    prev.impressions += c.impressions;
    prev.clicks += c.clicks;
    platformAgg.set(c.platform, prev);
  }

  const byPlatform: PlatformAdMetrics[] = [...platformAgg.entries()].map(
    ([platform, v]) => {
      const m = metricsFromTotals(v.spend, v.impressions, v.clicks);
      return {
        platform,
        platformLabel: AD_PLATFORM_LABELS[platform] ?? platform,
        spend: v.spend,
        impressions: v.impressions,
        clicks: v.clicks,
        currency: v.currency,
        ...m,
      };
    },
  );

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);

  return {
    total: {
      spend: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      ...metricsFromTotals(totalSpend, totalImpressions, totalClicks),
    },
    byPlatform,
    campaigns,
  };
}

export async function loadStoreAdMetricsForDay(
  storeId: string,
  dateKey: string,
): Promise<StoreAdMetricsBundle | null> {
  return loadStoreAdMetricsFromDb(storeId, [dateKey]);
}
