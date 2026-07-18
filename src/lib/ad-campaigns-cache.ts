import "server-only";
import { unstable_cache } from "next/cache";
import { loadStoreCampaignsLive } from "@/lib/ad-campaign-live";
import type { StoreCampaignsView } from "@/lib/ad-campaign-types";
import type { PeriodInput } from "@/lib/period";
import { safeRevalidateTag } from "@/lib/safe-revalidate";
import {
  clearRevisionMemoryCache,
  withRevisionMemoryCache,
} from "@/lib/revision-memory-cache";

const CAMPAIGNS_TTL_SEC = 45;

function periodCacheKey(input: PeriodInput = {}): string {
  const dates = input.dates?.trim();
  if (dates) return `dates:${dates}`;
  const from = input.from?.trim();
  const to = input.to?.trim();
  if (from && to) return `custom:${from}:${to}`;
  return `period:${input.period?.trim() || "30d"}`;
}

export function adCampaignsCacheTag(storeId: string): string {
  return `ad-campaigns-${storeId}`;
}

export function invalidateAdCampaignsCache(storeId: string): void {
  safeRevalidateTag(adCampaignsCacheTag(storeId));
  clearRevisionMemoryCache(`store:${storeId}:`);
}

/**
 * Campanhas a partir da BD com cache servidor (45 s) + memória por revisão.
 * Sync manual (`syncFirst`) ignora cache e vai à API.
 */
export async function getCachedStoreCampaignsView(
  storeId: string,
  periodInput: PeriodInput | undefined,
  options?: { syncFirst?: boolean; fresh?: boolean; workspaceId?: string },
): Promise<StoreCampaignsView> {
  if (options?.syncFirst) {
    return loadStoreCampaignsLive(storeId, {
      syncFirst: true,
      periodInput,
    });
  }

  const periodKey = periodCacheKey(periodInput);
  const fresh = Boolean(options?.fresh);
  const workspaceId = options?.workspaceId;
  const memKey = `store:${storeId}:ad-campaigns:${periodKey}`;

  const compute = async () => {
    if (fresh) {
      return loadStoreCampaignsLive(storeId, { periodInput });
    }
    return unstable_cache(
      async () => loadStoreCampaignsLive(storeId, { periodInput }),
      ["ad-campaigns-view", storeId, periodKey],
      {
        revalidate: CAMPAIGNS_TTL_SEC,
        tags: [adCampaignsCacheTag(storeId)],
      },
    )();
  };

  if (!workspaceId) {
    return compute();
  }

  return withRevisionMemoryCache(
    { key: `ws:${workspaceId}:${memKey}`, workspaceId, fresh },
    compute,
  );
}
