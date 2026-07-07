import "server-only";
import { connectToDatabase } from "@/lib/db";
import { AdCampaignDay } from "@/models/AdCampaignDay";

const LEGACY_INDEX = "storeId_1_platform_1_dateKey_1_campaignId_1";

let ensured = false;

/** Remove índice legado (sem adAccountId) e garante o índice actual do schema. */
export async function ensureAdCampaignDayIndexes(): Promise<void> {
  if (ensured) return;
  await connectToDatabase();

  const coll = AdCampaignDay.collection;
  try {
    const indexes = await coll.indexes();
    if (indexes.some((idx) => idx.name === LEGACY_INDEX)) {
      await coll.dropIndex(LEGACY_INDEX);
    }
  } catch {
    /* índice já removido ou permissões — upsert tolerante trata o resto */
  }

  try {
    await AdCampaignDay.syncIndexes();
  } catch {
    /* não bloqueia sync */
  }

  ensured = true;
}

export function isMongoDuplicateKeyError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: number }).code;
  if (code === 11000) return true;
  const message = e instanceof Error ? e.message : String(e);
  return message.includes("E11000");
}
