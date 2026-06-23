import "server-only";
import mongoose from "mongoose";
import { Store } from "@/models/Store";
import {
  credentialTokenForPlatform,
  decryptAdCredentials,
  loadActiveAdAccounts,
  type AdAccountCredentials,
} from "@/lib/ad-accounts";
import type { AdPlatform } from "@/lib/ad-spend-platforms";
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

/** Agrega CPC/CTR/CPM do dia a partir das contas API ligadas à loja. */
export async function fetchStoreAdInsightsForDay(
  storeId: string,
  dateKey: string,
): Promise<StoreAdInsights | null> {
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

/** Soma insights de vários dias (máx. 31) para o painel de métricas. */
export async function aggregateStoreAdInsightsForPeriod(
  storeId: string,
  dayKeys: string[],
): Promise<StoreAdInsights | null> {
  if (!dayKeys.length) return null;

  let spend = 0;
  let impressions = 0;
  let clicks = 0;

  for (const dateKey of dayKeys.slice(0, 31)) {
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
