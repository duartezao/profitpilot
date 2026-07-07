import "server-only";
import mongoose from "mongoose";
import { syncAdAccountsSpendForStore } from "@/lib/ad-api-sync";
import { loadSyncAdAccountsForStore } from "@/lib/ad-accounts";
import { invalidateWorkspaceMetricsCache } from "@/lib/metrics-summary-cache";

/** Intervalo mínimo entre syncs automáticos de ads no mesmo dia (Google/Meta API). */
import { AD_API_SYNC_INTERVAL_MS } from "@/lib/ad-sync-constants";

export type AdIntradaySyncResult = {
  synced: boolean;
  today?: string;
  skippedReason?: "no_accounts" | "throttled" | "locked" | "no_data";
};

/**
 * Sincroniza gasto de hoje se a última sync da conta API foi há mais de 5 min.
 * Actualiza ManualAdSpend (com fees) e invalida cache do dashboard.
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

  if (!options?.force) {
    const now = Date.now();
    const lastSync = accounts.reduce((max, a) => {
      const t = a.lastSyncAt?.getTime() ?? 0;
      return t > max ? t : max;
    }, 0);
    if (lastSync > 0 && now - lastSync < AD_API_SYNC_INTERVAL_MS) {
      return { synced: false, skippedReason: "throttled" };
    }
  }

  const result = await syncAdAccountsSpendForStore(storeId);
  const didWork =
    result.updated || (result.campaignsSynced ?? 0) > 0;
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
