import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import {
  credentialTokenForPlatform,
  decryptAdCredentials,
  loadActiveAdAccounts,
  type AdAccountCredentials,
} from "@/lib/ad-accounts";
import { AD_PLATFORM_LABELS, type AdPlatform } from "@/lib/ad-spend-platforms";
import {
  metricsFromCampaignTotals,
  type LiveCampaignRow,
  type StoreCampaignsView,
} from "@/lib/ad-campaign-types";
import { loadStoreAdMetricsForDay } from "@/lib/ad-campaign-metrics";
import { fetchMetaLiveCampaigns } from "@/lib/meta-ads";
import {
  fetchGoogleLiveCampaigns,
  googleAdsServerConfigStatus,
} from "@/lib/google-ads";
import { fetchTiktokLiveCampaigns } from "@/lib/tiktok-ads";
import {
  dateKeyInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";

async function fetchLiveForAccount(
  platform: AdPlatform,
  creds: AdAccountCredentials,
  externalAccountId: string,
  dateKey: string,
  adAccountId: string,
  adAccountName: string,
  allocationPct: number,
): Promise<LiveCampaignRow[]> {
    if (platform === "google" && !googleAdsServerConfigStatus().apiReady) {
      throw new Error(
        "Google Ads API indisponível neste servidor — confirma GOOGLE_ADS_DEVELOPER_TOKEN na Vercel e faz redeploy.",
      );
    }

  const token = credentialTokenForPlatform(platform, creds);
  let rows: LiveCampaignRow[] = [];

  switch (platform) {
    case "meta":
      rows = await fetchMetaLiveCampaigns(token, externalAccountId, dateKey);
      break;
    case "google":
      rows = await fetchGoogleLiveCampaigns(
        token,
        externalAccountId,
        dateKey,
      );
      break;
    case "tiktok":
      rows = await fetchTiktokLiveCampaigns(
        token,
        externalAccountId,
        dateKey,
      );
      break;
    default:
      return [];
  }

  const alloc = allocationPct / 100;
  return rows.map((r) => ({
    ...r,
    platform,
    platformLabel: AD_PLATFORM_LABELS[platform] ?? platform,
    adAccountId,
    adAccountName,
    spend: r.spend * alloc,
    impressions: Math.round(r.impressions * alloc),
    clicks: Math.round(r.clicks * alloc),
    ...metricsFromCampaignTotals(
      r.spend * alloc,
      Math.round(r.impressions * alloc),
      Math.round(r.clicks * alloc),
    ),
  }));
}


export async function loadStoreCampaignsLive(
  storeId: string,
  options?: { syncFirst?: boolean },
): Promise<StoreCampaignsView> {
  await connectToDatabase();

  if (!mongoose.isValidObjectId(storeId)) {
    return {
      storeId,
      dateKey: "",
      dateLabel: "",
      hasLinkedAccounts: false,
      source: "cache",
      syncedAt: null,
      campaigns: [],
      errors: ["Loja inválida."],
    };
  }

  const store = await Store.findById(storeId)
    .select("name ianaTimezone")
    .lean();
  if (!store) {
    return {
      storeId,
      dateKey: "",
      dateLabel: "",
      hasLinkedAccounts: false,
      source: "cache",
      syncedAt: null,
      campaigns: [],
      errors: ["Loja não encontrada."],
    };
  }

  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const dateKey = dateKeyInTimezone(new Date(), tz);
  const dateLabel = new Date(`${dateKey}T12:00:00`).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  if (options?.syncFirst) {
    const { syncAdAccountsSpendForStore } = await import("@/lib/ad-api-sync");
    try {
      await syncAdAccountsSpendForStore(storeId);
    } catch {
      /* continua com live/cache */
    }
  }

  const accounts = await loadActiveAdAccounts(store._id);
  if (!accounts.length) {
    return {
      storeId,
      dateKey,
      dateLabel,
      hasLinkedAccounts: false,
      source: "cache",
      syncedAt: null,
      campaigns: [],
      errors: [],
    };
  }

  const errors: string[] = [];
  const liveCampaigns: LiveCampaignRow[] = [];
  let liveCount = 0;

  for (const acc of accounts) {
    const platform = acc.platform as AdPlatform;
    const accountId = String(acc._id);
    const accountName =
      acc.accountName?.trim() || acc.externalAccountId || platform;

    try {
      const creds = decryptAdCredentials<AdAccountCredentials>(acc.credentials);
      const rows = await fetchLiveForAccount(
        platform,
        creds,
        acc.externalAccountId,
        dateKey,
        accountId,
        accountName,
        acc.allocation ?? 100,
      );
      liveCampaigns.push(...rows);
      liveCount++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao carregar campanhas.";
      errors.push(`${AD_PLATFORM_LABELS[platform] ?? platform}: ${msg}`);
    }
  }

  let campaigns = liveCampaigns;
  let source: StoreCampaignsView["source"] =
    liveCount > 0 ? "live" : "cache";

  if (liveCount === 0 || liveCount < accounts.length) {
    const cached = await loadStoreAdMetricsForDay(storeId, dateKey);
    if (cached?.campaigns.length) {
      const accountByPlatform = new Map(
        accounts.map((a) => [a.platform as AdPlatform, a]),
      );
      const cachedRows: LiveCampaignRow[] = cached.campaigns.map((c) => {
        const acc = accountByPlatform.get(c.platform);
        return {
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          platform: c.platform,
          platformLabel: c.platformLabel,
          adAccountId: acc ? String(acc._id) : "",
          adAccountName:
            acc?.accountName?.trim() || acc?.externalAccountId || c.platformLabel,
          status: "—",
          statusLabel: "—",
          spend: c.spend,
          impressions: c.impressions,
          clicks: c.clicks,
          currency: c.currency,
          cpc: c.cpc,
          ctr: c.ctr,
          cpm: c.cpm,
        };
      });

      if (liveCount === 0) {
        campaigns = cachedRows;
        source = "cache";
      } else {
        const liveKeys = new Set(
          liveCampaigns.map((c) => `${c.platform}:${c.campaignId}`),
        );
        for (const row of cachedRows) {
          const key = `${row.platform}:${row.campaignId}`;
          if (!liveKeys.has(key)) campaigns.push(row);
        }
        campaigns.sort((a, b) => b.spend - a.spend);
        source = "mixed";
      }
    }
  }

  const syncedAt =
    campaigns.length > 0
      ? new Date().toISOString()
      : accounts.find((a) => a.lastSyncAt)?.lastSyncAt?.toISOString() ?? null;

  return {
    storeId,
    dateKey,
    dateLabel,
    hasLinkedAccounts: true,
    source,
    syncedAt,
    campaigns,
    errors,
  };
}
