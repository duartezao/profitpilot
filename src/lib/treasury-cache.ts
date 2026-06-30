import "server-only";
import { unstable_cache } from "next/cache";
import { buildWorkspaceTreasury, type WorkspaceTreasury } from "@/lib/treasury";
import {
  serializeStoreAccess,
  type StoreAccess,
} from "@/lib/store-access";
import { workspaceMetricsCacheTag } from "@/lib/metrics-summary-cache";

const TREASURY_TTL_SEC = 60;

export async function getCachedWorkspaceTreasury(
  workspaceId: string,
  storeId: string | undefined,
  storeAccess: StoreAccess,
): Promise<WorkspaceTreasury> {
  const accessKey = serializeStoreAccess(storeAccess);
  const scopedStore = storeId ?? "all";

  return unstable_cache(
    async () => buildWorkspaceTreasury(workspaceId, storeId, storeAccess),
    ["treasury", workspaceId, scopedStore, accessKey],
    {
      revalidate: TREASURY_TTL_SEC,
      tags: [workspaceMetricsCacheTag(workspaceId)],
    },
  )();
}
