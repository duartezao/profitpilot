import "server-only";
import { unstable_cache } from "next/cache";
import {
  buildWorkspaceSummary,
  type DashboardSummary,
} from "@/lib/metrics";
import type { PeriodInput } from "@/lib/period";
import {
  serializeStoreAccess,
  type StoreAccess,
} from "@/lib/store-access";
import { invalidatePortfolioCachesForWorkspace } from "@/lib/portfolio-summary-cache";
import { safeRevalidateTag } from "@/lib/safe-revalidate";

const SUMMARY_TTL_SEC = 60;

function periodCacheKey(input: PeriodInput = {}): string {
  const dates = input.dates?.trim();
  if (dates) return `dates:${dates}`;
  const from = input.from?.trim();
  const to = input.to?.trim();
  if (from && to) return `custom:${from}:${to}`;
  return `period:${input.period?.trim() || "30d"}`;
}

export function workspaceMetricsCacheTag(workspaceId: string): string {
  return `workspace-metrics-${workspaceId}`;
}

/** Invalida cache de summary após sync ou alterações financeiras. */
export function invalidateWorkspaceMetricsCache(workspaceId: string): void {
  safeRevalidateTag(workspaceMetricsCacheTag(workspaceId));
  invalidatePortfolioCachesForWorkspace(workspaceId);
}

/**
 * Summary do dashboard com cache servidor (60 s).
 * Evita recalcular agregações MongoDB em pedidos repetidos.
 */
export async function getCachedWorkspaceSummary(
  workspaceId: string,
  storeId: string | undefined,
  periodInput: PeriodInput | undefined,
  storeAccess: StoreAccess,
): Promise<DashboardSummary> {
  const periodKey = periodCacheKey(periodInput);
  const accessKey = serializeStoreAccess(storeAccess);
  const scopedStore = storeId ?? "all";

  return unstable_cache(
    async () =>
      buildWorkspaceSummary(
        workspaceId,
        storeId,
        periodInput,
        storeAccess,
      ),
    [
      "metrics-summary",
      workspaceId,
      scopedStore,
      periodKey,
      accessKey,
    ],
    {
      revalidate: SUMMARY_TTL_SEC,
      tags: [workspaceMetricsCacheTag(workspaceId)],
    },
  )();
}
