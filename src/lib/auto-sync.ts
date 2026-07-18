import "server-only";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { syncStore } from "@/lib/shopify-sync";
import { getGlobalSyncIntervalMinutes } from "@/lib/sync-config";

// Evita execuções sobrepostas no mesmo processo (ex. dev com instrumentation).
let running = false;

export type DueSyncResult = {
  checked: number;
  synced: number;
  failed: number;
  skipped: number;
  intervalMinutes: number;
};

/**
 * Sincroniza em lote todas as lojas com autoSync cuja última sync já passou
 * o intervalo **global** (predefinido: 30 min, `GLOBAL_SYNC_INTERVAL_MINUTES`).
 *
 * Em produção na Vercel: Vercel Cron (`vercel.json`) corre a cada 30 min
 * e sincroniza todas as lojas em falta — um único pedido para todos os workspaces.
 */
export async function runDueSyncs(): Promise<DueSyncResult> {
  if (running) {
    return {
      checked: 0,
      synced: 0,
      failed: 0,
      skipped: 0,
      intervalMinutes: getGlobalSyncIntervalMinutes(),
    };
  }
  running = true;

  const intervalMinutes = getGlobalSyncIntervalMinutes();
  const intervalMs = intervalMinutes * 60 * 1000;
  const result: DueSyncResult = {
    checked: 0,
    synced: 0,
    failed: 0,
    skipped: 0,
    intervalMinutes,
  };

  try {
    await connectToDatabase();
    const stores = await Store.find({
      deletedAt: null,
      status: "active",
      autoSync: true,
      platform: "shopify",
    })
      .select("lastSyncAt")
      .lean();

    const now = Date.now();

    for (const s of stores) {
      result.checked++;
      const last = s.lastSyncAt ? new Date(s.lastSyncAt).getTime() : 0;
      const due = now - last >= intervalMs;
      if (!due) {
        result.skipped++;
        continue;
      }

      try {
        await syncStore(String(s._id));
        await Store.updateOne({ _id: s._id }, { lastSyncError: null });
        result.synced++;
      } catch (e) {
        result.failed++;
        await Store.updateOne(
          { _id: s._id },
          { lastSyncError: e instanceof Error ? e.message : "Erro de sync." },
        );
      }
    }
  } finally {
    running = false;
  }

  return result;
}
