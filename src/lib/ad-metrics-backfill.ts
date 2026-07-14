import "server-only";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { AdCampaignDay } from "@/models/AdCampaignDay";
import { loadSyncAdAccountsForStore } from "@/lib/ad-accounts";
import { isStoreAdApiQuotaPaused } from "@/lib/ad-api-quota";
import { syncAdAccountsSpendForStore } from "@/lib/ad-api-sync";
import {
  dateKeyInTimezone,
  dayKeysBetweenInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import {
  buildAdMetricsCursor,
  googleConversionRefreshDateKeys,
  resolveIncrementalAdDateKeys,
} from "@/lib/ad-metrics-cursor";

export type AdMetricsBackfillResult = {
  checked: number;
  synced: number;
  spendDays: number;
  cursor: {
    lastSpendDateKey: string | null;
    lastCampaignDateKey: string | null;
    lastCompleteDateKey: string | null;
  };
};

/**
 * Preenche dias em falta de gasto API e campanhas (incremental, como sessões/taxas Shopify).
 * - Só pede à API dias em lacuna ou **hoje** (substitui totais — nunca soma em cima).
 * - Dias passados completos na BD ficam fechados (sem novo pedido Google/Meta).
 */
export async function syncMissingAdMetricsForStore(
  storeId: string,
  options?: { maxDays?: number; force?: boolean },
): Promise<AdMetricsBackfillResult> {
  await connectToDatabase();
  const maxDays = options?.maxDays ?? 45;
  const force = Boolean(options?.force);

  const store = await Store.findById(storeId)
    .select("importStartDate createdAt ianaTimezone")
    .lean();
  const emptyCursor = {
    lastSpendDateKey: null,
    lastCampaignDateKey: null,
    lastCompleteDateKey: null,
  };
  if (!store) {
    return { checked: 0, synced: 0, spendDays: 0, cursor: emptyCursor };
  }

  const accounts = await loadSyncAdAccountsForStore(store._id);
  if (!accounts.length) {
    return { checked: 0, synced: 0, spendDays: 0, cursor: emptyCursor };
  }

  if (!force && isStoreAdApiQuotaPaused(accounts)) {
    return { checked: 0, synced: 0, spendDays: 0, cursor: emptyCursor };
  }

  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const today = dateKeyInTimezone(new Date(), tz);
  const floor = store.importStartDate
    ? new Date(store.importStartDate)
    : store.createdAt
      ? new Date(store.createdAt)
      : new Date();
  const allKeys = dayKeysBetweenInTimezone(floor, new Date(), tz);
  if (!allKeys.length) {
    return { checked: 0, synced: 0, spendDays: 0, cursor: emptyCursor };
  }

  const accountIds = accounts.map((a) => a._id);
  const activePlatforms = [...new Set(accounts.map((a) => a.platform))];

  const [spendDocs, campaignDates, lastSpendDoc, lastCampaignDoc] =
    await Promise.all([
      ManualAdSpend.find({
        storeId: store._id,
        dateKey: { $in: allKeys },
      })
        .select("dateKey")
        .lean(),
      AdCampaignDay.distinct("dateKey", {
        storeId: store._id,
        adAccountId: { $in: accountIds },
        platform: { $in: activePlatforms },
        dateKey: { $in: allKeys },
      }),
      ManualAdSpend.findOne({ storeId: store._id })
        .sort({ dateKey: -1 })
        .select("dateKey")
        .lean(),
      AdCampaignDay.findOne({
        storeId: store._id,
        adAccountId: { $in: accountIds },
      })
        .sort({ dateKey: -1 })
        .select("dateKey")
        .lean(),
    ]);

  const hasSpend = new Set(spendDocs.map((d) => d.dateKey));
  const hasCampaign = new Set(campaignDates as string[]);

  const cursor = buildAdMetricsCursor(
    spendDocs.map((d) => d.dateKey),
    campaignDates as string[],
  );
  if (lastSpendDoc?.dateKey) cursor.lastSpendDateKey = lastSpendDoc.dateKey;
  if (lastCampaignDoc?.dateKey) {
    cursor.lastCampaignDateKey = lastCampaignDoc.dateKey;
  }

  const toSyncIncremental = resolveIncrementalAdDateKeys({
    allKeys,
    today,
    maxDays,
    spendDays: hasSpend,
    campaignDays: hasCampaign,
  });
  const hasGoogle = accounts.some((a) => a.platform === "google");
  const googleRefreshOnly = hasGoogle
    ? googleConversionRefreshDateKeys(allKeys, today).filter(
        (dateKey) =>
          dateKey !== today && !toSyncIncremental.includes(dateKey),
      )
    : [];
  const toSync = [...new Set([...toSyncIncremental, ...googleRefreshOnly])]
    .sort()
    .slice(-Math.max(1, maxDays));

  let synced = 0;
  let spendDays = 0;

  for (const dateKey of toSync) {
    const googleOnlyRefresh = googleRefreshOnly.includes(dateKey);
    try {
      const result = await syncAdAccountsSpendForStore(storeId, {
        dateKey,
        campaignDateKeys: [dateKey],
        skipDailyNote: dateKey !== today,
        skipSpendSync:
          googleOnlyRefresh ||
          (!force && hasSpend.has(dateKey) && dateKey !== today),
        campaignPlatforms: googleOnlyRefresh ? ["google"] : undefined,
        forceOverwrite: force,
      });
      synced++;
      if (result.updated) spendDays++;
    } catch {
      /* continua nos restantes dias */
    }
  }

  return {
    checked: toSync.length,
    synced,
    spendDays,
    cursor,
  };
}
