import "server-only";
import type { Types } from "mongoose";
import { AdCampaignDay } from "@/models/AdCampaignDay";
import {
  credentialTokenForPlatform,
  decryptAdCredentials,
  loadActiveAdAccounts,
  markAdAccountSync,
  type AdAccountCredentials,
} from "@/lib/ad-accounts";
import type { AdPlatform } from "@/lib/ad-spend-platforms";
import {
  fetchMetaCampaignInsightsForDay,
  type CampaignInsightsRow as MetaCampaignRow,
} from "@/lib/meta-ads";
import {
  fetchGoogleCampaignInsightsForDay,
  type CampaignInsightsRow as GoogleCampaignRow,
} from "@/lib/google-ads";
import {
  fetchTiktokCampaignInsightsForDay,
  type CampaignInsightsRow as TiktokCampaignRow,
} from "@/lib/tiktok-ads";

type CampaignRow = MetaCampaignRow | GoogleCampaignRow | TiktokCampaignRow;

async function fetchCampaignRows(
  platform: AdPlatform,
  creds: AdAccountCredentials,
  externalAccountId: string,
  dateKey: string,
): Promise<CampaignRow[]> {
  const token = credentialTokenForPlatform(platform, creds);
  switch (platform) {
    case "meta":
      return fetchMetaCampaignInsightsForDay(token, externalAccountId, dateKey);
    case "google":
      return fetchGoogleCampaignInsightsForDay(
        token,
        externalAccountId,
        dateKey,
      );
    case "tiktok":
      return fetchTiktokCampaignInsightsForDay(
        token,
        externalAccountId,
        dateKey,
      );
    default:
      return [];
  }
}

async function upsertCampaignRows(
  workspaceId: Types.ObjectId,
  storeId: Types.ObjectId,
  adAccountId: Types.ObjectId,
  platform: AdPlatform,
  dateKey: string,
  rows: CampaignRow[],
  allocationPct: number,
): Promise<number> {
  const alloc = allocationPct / 100;
  let count = 0;

  for (const row of rows) {
    await AdCampaignDay.findOneAndUpdate(
      {
        storeId,
        platform,
        dateKey,
        campaignId: row.campaignId,
      },
      {
        $set: {
          workspaceId,
          adAccountId,
          campaignName: row.campaignName,
          spend: row.spend * alloc,
          currency: row.currency,
          impressions: Math.round(row.impressions * alloc),
          clicks: Math.round(row.clicks * alloc),
          syncedAt: new Date(),
        },
      },
      { upsert: true },
    );
    count++;
  }

  return count;
}

export type CampaignSyncResult = {
  storeId: string;
  dateKey: string;
  campaignsSynced: number;
};

/** Sincroniza métricas por campanha (spend, impressões, cliques) para um dia. */
export async function syncAdCampaignMetricsForStoreDay(
  storeId: string,
  dateKey: string,
): Promise<CampaignSyncResult> {
  const { Store } = await import("@/models/Store");
  const store = await Store.findById(storeId)
    .select("workspaceId")
    .lean();
  if (!store) {
    return { storeId, dateKey, campaignsSynced: 0 };
  }

  const accounts = await loadActiveAdAccounts(store._id);
  if (!accounts.length) {
    return { storeId, dateKey, campaignsSynced: 0 };
  }

  const accountByPlatform = new Map<AdPlatform, (typeof accounts)[number]>();
  for (const acc of accounts) {
    const platform = acc.platform as AdPlatform;
    if (!accountByPlatform.has(platform)) {
      accountByPlatform.set(platform, acc);
    }
  }

  let campaignsSynced = 0;

  for (const acc of accountByPlatform.values()) {
    const platform = acc.platform as AdPlatform;
    try {
      const creds = decryptAdCredentials<AdAccountCredentials>(acc.credentials);
      const rows = await fetchCampaignRows(
        platform,
        creds,
        acc.externalAccountId,
        dateKey,
      );
      const n = await upsertCampaignRows(
        store.workspaceId,
        store._id,
        acc._id,
        platform,
        dateKey,
        rows,
        acc.allocation ?? 100,
      );
      campaignsSynced += n;
      await markAdAccountSync(acc._id, true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no sync de campanhas.";
      await markAdAccountSync(acc._id, false, msg);
    }
  }

  return { storeId, dateKey, campaignsSynced };
}
