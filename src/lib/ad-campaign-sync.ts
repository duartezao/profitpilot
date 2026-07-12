import "server-only";
import type { Types } from "mongoose";
import { AdCampaignDay } from "@/models/AdCampaignDay";
import {
  ensureAdCampaignDayIndexes,
  isMongoDuplicateKeyError,
} from "@/lib/ad-campaign-indexes";
import {
  credentialTokenForPlatform,
  decryptAdCredentials,
  googleLoginCustomerIdFromCreds,
  loadSyncAdAccountsForStore,
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
import { recordCampaignBudgetScaleIfNeeded } from "@/lib/campaign-scale";
import { recordCampaignPauseIfNeeded } from "@/lib/campaign-pause";

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
        googleLoginCustomerIdFromCreds(creds),
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

async function upsertOneCampaignRow(
  workspaceId: Types.ObjectId,
  storeId: Types.ObjectId,
  adAccountId: Types.ObjectId,
  adAccountName: string,
  platform: AdPlatform,
  dateKey: string,
  row: CampaignRow,
  allocationPct: number,
): Promise<void> {
  const alloc = allocationPct / 100;
  const campaignId = row.campaignId;
  const dailyBudget =
    row.dailyBudget != null && row.dailyBudget > 0
      ? row.dailyBudget * alloc
      : null;
  const setFields = {
    workspaceId,
    adAccountId,
    campaignName: row.campaignName,
    spend: row.spend * alloc,
    currency: row.currency,
    impressions: Math.round(row.impressions * alloc),
    clicks: Math.round(row.clicks * alloc),
    conversions: row.conversions * alloc,
    conversionValue: row.conversionValue * alloc,
    status: row.status ?? "",
    statusLabel: row.statusLabel ?? "",
    dailyBudget,
    syncedAt: new Date(),
  };

  const byAccount = { storeId, adAccountId, platform, dateKey, campaignId };

  const existing =
    (await AdCampaignDay.findOne(byAccount).select("status").lean()) ??
    (await AdCampaignDay.findOne({
      storeId,
      platform,
      dateKey,
      campaignId,
    })
      .select("status")
      .lean());
  const previousStatus = existing?.status ?? null;

  const onAccount = await AdCampaignDay.findOneAndUpdate(
    byAccount,
    { $set: setFields },
  );
  if (!onAccount) {
    const onLegacy = await AdCampaignDay.findOneAndUpdate(
      { storeId, platform, dateKey, campaignId },
      { $set: setFields },
    );
    if (!onLegacy) {
      try {
        await AdCampaignDay.create({ ...byAccount, ...setFields });
      } catch (e) {
        if (!isMongoDuplicateKeyError(e)) throw e;
        await AdCampaignDay.updateOne(
          { storeId, platform, dateKey, campaignId },
          { $set: setFields },
        );
      }
    }
  }

  if (dailyBudget != null && dailyBudget > 0) {
    await recordCampaignBudgetScaleIfNeeded({
      workspaceId,
      storeId,
      adAccountId,
      adAccountName,
      platform,
      campaignId,
      campaignName: row.campaignName,
      dateKey,
      newBudget: dailyBudget,
      currency: row.currency,
    });
  }

  await recordCampaignPauseIfNeeded({
    workspaceId,
    storeId,
    adAccountId,
    adAccountName,
    platform,
    campaignId,
    campaignName: row.campaignName,
    dateKey,
    newStatus: row.status ?? "",
    previousStatus,
  });
}

async function upsertCampaignRows(
  workspaceId: Types.ObjectId,
  storeId: Types.ObjectId,
  adAccountId: Types.ObjectId,
  adAccountName: string,
  platform: AdPlatform,
  dateKey: string,
  rows: CampaignRow[],
  allocationPct: number,
): Promise<number> {
  const syncedIds: string[] = [];

  for (const row of rows) {
    syncedIds.push(row.campaignId);
    await upsertOneCampaignRow(
      workspaceId,
      storeId,
      adAccountId,
      adAccountName,
      platform,
      dateKey,
      row,
      allocationPct,
    );
  }

  // Resposta vazia da API não apaga o que já estava na BD (evita perder campanhas ao actualizar).
  if (!rows.length) return 0;

  // Só remove órfãos desta conta — não apaga histórico de contas antigas/desligadas.
  await AdCampaignDay.deleteMany({
    storeId,
    adAccountId,
    platform,
    dateKey,
    campaignId: { $nin: syncedIds },
  });

  return syncedIds.length;
}

export type CampaignSyncResult = {
  storeId: string;
  dateKey: string;
  campaignsSynced: number;
};

/** Sincroniza métricas por campanha (spend, conversões, ROAS) para um dia. */
export async function syncAdCampaignMetricsForStoreDay(
  storeId: string,
  dateKey: string,
  options?: { platforms?: AdPlatform[] },
): Promise<CampaignSyncResult> {
  await ensureAdCampaignDayIndexes();

  const { Store } = await import("@/models/Store");
  const store = await Store.findById(storeId)
    .select("workspaceId")
    .lean();
  if (!store) {
    return { storeId, dateKey, campaignsSynced: 0 };
  }

  const accounts = await loadSyncAdAccountsForStore(store._id);
  if (!accounts.length) {
    return { storeId, dateKey, campaignsSynced: 0 };
  }

  let campaignsSynced = 0;

  for (const acc of accounts) {
    const platform = acc.platform as AdPlatform;
    if (options?.platforms && !options.platforms.includes(platform)) continue;
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
        acc.accountName?.trim() || acc.externalAccountId || platform,
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

/** Sincroniza campanhas para vários dias (ex. últimos 7). */
export async function syncAdCampaignMetricsForStoreDays(
  storeId: string,
  dateKeys: string[],
  options?: { platforms?: AdPlatform[] },
): Promise<CampaignSyncResult> {
  let campaignsSynced = 0;
  const sorted = [...new Set(dateKeys)].sort();
  for (const dateKey of sorted) {
    const r = await syncAdCampaignMetricsForStoreDay(storeId, dateKey, options);
    campaignsSynced += r.campaignsSynced;
  }
  const last = sorted[sorted.length - 1] ?? "";
  return { storeId, dateKey: last, campaignsSynced };
}
