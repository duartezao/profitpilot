import "server-only";
import mongoose from "mongoose";
import { syncAdAccountsSpendForStore } from "@/lib/ad-api-sync";
import { loadSyncAdAccountsForStore } from "@/lib/ad-accounts";
import { isStoreAdApiQuotaPaused } from "@/lib/ad-api-quota";
import { invalidateWorkspaceMetricsCache } from "@/lib/metrics-summary-cache";
import { yesterdayDateKey } from "@/lib/ad-spend-complete";
import {
  dateKeyInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";

/** Intervalo mínimo entre syncs automáticos de ads (cron Vercel, de 2 em 2 h). */
import { AD_CRON_SYNC_INTERVAL_MS } from "@/lib/ad-sync-constants";

export type AdIntradaySyncResult = {
  synced: boolean;
  today?: string;
  skippedReason?:
    | "no_accounts"
    | "throttled"
    | "locked"
    | "no_data"
    | "quota_paused";
  quotaPaused?: boolean;
};

/**
 * Sincroniza gasto de hoje se passou o intervalo do cron desde a última sync.
 * Manual (`force: true`) ignora throttle e quota pausada.
 */
export async function syncAdSpendIfDue(
  storeId: string,
  workspaceId: string,
  options?: { force?: boolean },
): Promise<AdIntradaySyncResult> {
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const accounts = await loadSyncAdAccountsForStore(storeOid);
  if (!accounts.length) {
    return { synced: false, skippedReason: "no_accounts" };
  }

  const quotaPaused = isStoreAdApiQuotaPaused(accounts);
  if (!options?.force && quotaPaused) {
    return { synced: false, skippedReason: "quota_paused", quotaPaused: true };
  }

  if (!options?.force) {
    const now = Date.now();
    const lastSync = accounts.reduce((max, a) => {
      const t = a.lastSyncAt?.getTime() ?? 0;
      return t > max ? t : max;
    }, 0);
    if (lastSync > 0 && now - lastSync < AD_CRON_SYNC_INTERVAL_MS) {
      return { synced: false, skippedReason: "throttled" };
    }
  }

  const result = await syncAdAccountsSpendForStore(storeId);
  let didWork =
    result.updated || (result.campaignsSynced ?? 0) > 0;

  const { Store } = await import("@/models/Store");
  const { ManualAdSpend } = await import("@/models/ManualAdSpend");
  const store = await Store.findById(storeId).select("ianaTimezone").lean();
  const tz = normalizeStoreTimezone(store?.ianaTimezone);
  const today = dateKeyInTimezone(new Date(), tz);
  const yesterday = yesterdayDateKey(today);
  const yDoc = await ManualAdSpend.findOne({
    storeId: storeOid,
    dateKey: yesterday,
  })
    .select("dateKey source amount updatedAt")
    .lean();
  const { isApiSpendDayClosed } = await import("@/lib/ad-spend-complete");
  if (
    !isApiSpendDayClosed(
      yDoc
        ? {
            dateKey: yesterday,
            source: yDoc.source as string | undefined,
            amount: yDoc.amount,
            updatedAt: yDoc.updatedAt,
          }
        : null,
      today,
      tz,
    )
  ) {
    const yResult = await syncAdAccountsSpendForStore(storeId, {
      dateKey: yesterday,
      campaignDateKeys: [yesterday],
      forceOverwrite: Boolean(yDoc),
      skipDailyNote: true,
    });
    didWork =
      didWork ||
      yResult.updated ||
      (yResult.campaignsSynced ?? 0) > 0;
  }

  if (didWork) {
    invalidateWorkspaceMetricsCache(workspaceId);
    return { synced: true, today: result.today };
  }

  return {
    synced: false,
    today: result.today,
    skippedReason: result.skippedReason ?? "no_data",
  };
}
