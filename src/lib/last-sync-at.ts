import "server-only";
import mongoose from "mongoose";
import { Store } from "@/models/Store";
import { AdAccount } from "@/models/AdAccount";

function maxTimestamp(
  ...values: (Date | string | null | undefined)[]
): number {
  let max = 0;
  for (const v of values) {
    if (!v) continue;
    const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

/**
 * Último sync conhecido (Shopify, sessões, payouts, contas de ads).
 * ISO string ou null se nunca sincronizou.
 */
export async function resolveLastSyncedAtForStoreIds(
  storeIds: string[],
): Promise<string | null> {
  const oids = storeIds
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!oids.length) return null;

  const [stores, accounts] = await Promise.all([
    Store.find({ _id: { $in: oids } })
      .select("lastSyncAt lastSessionMetricsAt paymentsBalanceUpdatedAt")
      .lean(),
    AdAccount.find({ storeId: { $in: oids }, deletedAt: null })
      .select("lastSyncAt")
      .lean(),
  ]);

  let max = 0;
  for (const s of stores) {
    max = Math.max(
      max,
      maxTimestamp(
        s.lastSyncAt,
        s.lastSessionMetricsAt,
        s.paymentsBalanceUpdatedAt,
      ),
    );
  }
  for (const a of accounts) {
    max = Math.max(max, maxTimestamp(a.lastSyncAt));
  }

  return max > 0 ? new Date(max).toISOString() : null;
}
