import "server-only";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { loadSyncAdAccountsForStore } from "@/lib/ad-accounts";
import { syncAdSpendIfDue } from "@/lib/ad-intraday-sync";
import { syncMissingAdMetricsForStore } from "@/lib/ad-metrics-backfill";

let running = false;

export type AdBackgroundSyncResult = {
  stores: number;
  intradaySynced: number;
  intradayThrottled: number;
  backfillDays: number;
  skippedOverlap: boolean;
};

/**
 * Sync contínuo de ads enquanto o processo Node está activo (instrumentation local).
 * Hoje: throttle 24 h por conta. Lacunas: até 2 dias em falta por loja por ciclo.
 */
export async function runDueAdSyncs(): Promise<AdBackgroundSyncResult> {
  if (running) {
    return {
      stores: 0,
      intradaySynced: 0,
      intradayThrottled: 0,
      backfillDays: 0,
      skippedOverlap: true,
    };
  }
  running = true;

  const result: AdBackgroundSyncResult = {
    stores: 0,
    intradaySynced: 0,
    intradayThrottled: 0,
    backfillDays: 0,
    skippedOverlap: false,
  };

  try {
    await connectToDatabase();
    const stores = await Store.find({
      deletedAt: null,
      status: "active",
    })
      .select("_id workspaceId")
      .lean();

    for (const store of stores) {
      const accounts = await loadSyncAdAccountsForStore(store._id);
      if (!accounts.length) continue;

      result.stores++;
      const storeId = String(store._id);
      const workspaceId = String(store.workspaceId);

      try {
        const intraday = await syncAdSpendIfDue(storeId, workspaceId);
        if (intraday.synced) result.intradaySynced++;
        else if (intraday.skippedReason === "throttled") result.intradayThrottled++;

        const backfill = await syncMissingAdMetricsForStore(storeId, {
          maxDays: 2,
        });
        result.backfillDays += backfill.synced;
      } catch {
        /* continua nas outras lojas */
      }
    }
  } finally {
    running = false;
  }

  return result;
}
