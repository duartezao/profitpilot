import "server-only";
import mongoose from "mongoose";
import { Store } from "@/models/Store";
import {
  credentialTokenForPlatform,
  decryptAdCredentials,
  googleLoginCustomerIdFromCreds,
  loadActiveAdAccounts,
  type AdAccountCredentials,
} from "@/lib/ad-accounts";
import type { AdPlatform } from "@/lib/ad-spend-platforms";
import {
  loadStoreAdMetricsForDay,
  loadStoreAdMetricsFromDb,
  type StoreAdMetricsBundle,
} from "@/lib/ad-campaign-metrics";
import { metricsFromCampaignTotals } from "@/lib/ad-campaign-types";
import { fetchMetaAdInsightsForDay } from "@/lib/meta-ads";
import { fetchGoogleAdInsightsForDay } from "@/lib/google-ads";
import { fetchTiktokAdInsightsForDay } from "@/lib/tiktok-ads";

export type StoreAdInsights = {
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;
};

async function insightsForAccount(
  platform: AdPlatform,
  creds: AdAccountCredentials,
  externalAccountId: string,
  dateKey: string,
): Promise<{ spend: number; impressions: number; clicks: number }> {
  const token = credentialTokenForPlatform(platform, creds);
  switch (platform) {
    case "meta": {
      const r = await fetchMetaAdInsightsForDay(
        token,
        externalAccountId,
        dateKey,
      );
      return { spend: r.spend, impressions: r.impressions, clicks: r.clicks };
    }
    case "google": {
      const r = await fetchGoogleAdInsightsForDay(
        token,
        externalAccountId,
        dateKey,
        googleLoginCustomerIdFromCreds(creds),
      );
      return { spend: r.spend, impressions: r.impressions, clicks: r.clicks };
    }
    case "tiktok": {
      const r = await fetchTiktokAdInsightsForDay(
        token,
        externalAccountId,
        dateKey,
      );
      return { spend: r.spend, impressions: r.impressions, clicks: r.clicks };
    }
    default:
      return { spend: 0, impressions: 0, clicks: 0 };
  }
}

/**
 * Métricas do dia com impressões garantidas para CPM/CTR.
 * Se a BD tiver spend/cliques mas 0 impressões, complementa via API.
 */
export async function resolveStoreAdMetricsForDay(
  storeId: string,
  dateKey: string,
  options?: { adAccountIds?: string[] },
): Promise<StoreAdMetricsBundle | null> {
  let metrics = await loadStoreAdMetricsForDay(storeId, dateKey, options);

  const needsImpressions =
    !metrics ||
    (metrics.total.impressions <= 0 &&
      (metrics.total.spend > 0 || metrics.total.clicks > 0));

  if (!needsImpressions) return metrics;

  const insights = await fetchStoreAdInsightsForDay(storeId, dateKey);
  if (!insights) return metrics;

  if (!metrics) {
    return {
      total: {
        spend: insights.spend,
        impressions: insights.impressions,
        clicks: insights.clicks,
        cpc: insights.cpc,
        ctr: insights.ctr,
        cpm: insights.cpm,
      },
      byPlatform: [],
      campaigns: [],
    };
  }

  const spend =
    metrics.total.spend > 0 ? metrics.total.spend : insights.spend;
  const clicks =
    metrics.total.clicks > 0 ? metrics.total.clicks : insights.clicks;
  const impressions = insights.impressions;

  return {
    ...metrics,
    total: {
      spend,
      impressions,
      clicks,
      ...metricsFromCampaignTotals(spend, impressions, clicks),
    },
  };
}

/** Agrega CPC/CTR/CPM do dia a partir da BD (sync) ou das contas API. */
export async function fetchStoreAdInsightsForDay(
  storeId: string,
  dateKey: string,
): Promise<StoreAdInsights | null> {
  const fromDb = await loadStoreAdMetricsForDay(storeId, dateKey);
  if (
    fromDb &&
    fromDb.total.impressions > 0 &&
    (fromDb.total.spend > 0 ||
      fromDb.total.clicks > 0)
  ) {
    return {
      spend: fromDb.total.spend,
      impressions: fromDb.total.impressions,
      clicks: fromDb.total.clicks,
      cpc: fromDb.total.cpc,
      ctr: fromDb.total.ctr,
      cpm: fromDb.total.cpm,
    };
  }

  const storeOid = new mongoose.Types.ObjectId(storeId);
  const store = await Store.findById(storeOid).select("_id").lean();
  if (!store) return null;

  const accounts = await loadActiveAdAccounts(storeOid);
  if (!accounts.length) return null;

  let spend = 0;
  let impressions = 0;
  let clicks = 0;

  for (const acc of accounts) {
    try {
      const creds = decryptAdCredentials<AdAccountCredentials>(acc.credentials);
      const ins = await insightsForAccount(
        acc.platform as AdPlatform,
        creds,
        acc.externalAccountId,
        dateKey,
      );
      const alloc = (acc.allocation ?? 100) / 100;
      spend += ins.spend * alloc;
      impressions += ins.impressions * alloc;
      clicks += ins.clicks * alloc;
    } catch {
      /* conta sem insights — ignora */
    }
  }

  if (spend <= 0 && impressions <= 0 && clicks <= 0) {
    if (fromDb && fromDb.total.spend > 0) {
      return {
        spend: fromDb.total.spend,
        impressions: 0,
        clicks: fromDb.total.clicks,
        cpc: fromDb.total.cpc,
        ctr: null,
        cpm: null,
      };
    }
    return null;
  }

  return {
    spend,
    impressions,
    clicks,
    cpc: clicks > 0 ? spend / clicks : null,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}

/** Soma insights de vários dias (máx. 31) para o painel de métricas. */
export async function aggregateStoreAdInsightsForPeriod(
  storeId: string,
  dayKeys: string[],
): Promise<StoreAdInsights | null> {
  if (!dayKeys.length) return null;

  const capped = dayKeys.slice(0, 31);
  const fromDb = await loadStoreAdMetricsFromDb(storeId, capped);
  if (
    fromDb &&
    (fromDb.total.spend > 0 ||
      fromDb.total.impressions > 0 ||
      fromDb.total.clicks > 0)
  ) {
    return {
      spend: fromDb.total.spend,
      impressions: fromDb.total.impressions,
      clicks: fromDb.total.clicks,
      cpc: fromDb.total.cpc,
      ctr: fromDb.total.ctr,
      cpm: fromDb.total.cpm,
    };
  }

  let spend = 0;
  let impressions = 0;
  let clicks = 0;

  for (const dateKey of capped) {
    const ins = await fetchStoreAdInsightsForDay(storeId, dateKey);
    if (!ins) continue;
    spend += ins.spend;
    impressions += ins.impressions;
    clicks += ins.clicks;
  }

  if (spend <= 0 && impressions <= 0 && clicks <= 0) return null;

  return {
    spend,
    impressions,
    clicks,
    cpc: clicks > 0 ? spend / clicks : null,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}
