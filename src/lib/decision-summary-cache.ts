import "server-only";
import { unstable_cache } from "next/cache";
import { buildDecisionSummary, type DecisionSummary } from "@/lib/decision";
import type { PeriodInput } from "@/lib/period";
import {
  serializeStoreAccess,
  type StoreAccess,
} from "@/lib/store-access";
import { workspaceMetricsCacheTag } from "@/lib/metrics-summary-cache";
import { withRevisionMemoryCache } from "@/lib/revision-memory-cache";

const DECISION_TTL_SEC = 60;

function periodCacheKey(input: PeriodInput = {}): string {
  const dates = input.dates?.trim();
  if (dates) return `dates:${dates}`;
  const from = input.from?.trim();
  const to = input.to?.trim();
  if (from && to) return `custom:${from}:${to}`;
  return `period:${input.period?.trim() || "30d"}`;
}

export async function getCachedDecisionSummary(
  workspaceId: string,
  storeId: string | undefined,
  periodInput: PeriodInput | undefined,
  storeAccess: StoreAccess,
  analysisWindowDays: 5 | 7 = 7,
  options?: { fresh?: boolean },
): Promise<DecisionSummary> {
  const periodKey = periodCacheKey(periodInput);
  const accessKey = serializeStoreAccess(storeAccess);
  const scopedStore = storeId ?? "all";
  const fresh = Boolean(options?.fresh);
  const memKey = `ws:${workspaceId}:decision-summary:${scopedStore}:${periodKey}:${accessKey}:window:${analysisWindowDays}`;

  return withRevisionMemoryCache(
    { key: memKey, workspaceId, fresh },
    async () => {
      if (fresh) {
        return buildDecisionSummary(
          workspaceId,
          storeId,
          periodInput,
          storeAccess,
          analysisWindowDays,
        );
      }
      return unstable_cache(
        async () =>
          buildDecisionSummary(
            workspaceId,
            storeId,
            periodInput,
            storeAccess,
            analysisWindowDays,
          ),
        [
          "decision-summary",
          workspaceId,
          scopedStore,
          periodKey,
          accessKey,
          `window:${analysisWindowDays}`,
        ],
        {
          revalidate: DECISION_TTL_SEC,
          tags: [workspaceMetricsCacheTag(workspaceId)],
        },
      )();
    },
  );
}
