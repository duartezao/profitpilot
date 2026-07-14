import "server-only";
import { unstable_cache } from "next/cache";
import {
  buildPortfolioSummary,
  type PortfolioSummary,
} from "@/lib/portfolio-metrics";
import type { PeriodInput } from "@/lib/period";
import { safeRevalidateTag } from "@/lib/safe-revalidate";

const PORTFOLIO_TTL_SEC = 60;

function periodCacheKey(input: PeriodInput = {}): string {
  const dates = input.dates?.trim();
  if (dates) return `dates:${dates}`;
  const from = input.from?.trim();
  const to = input.to?.trim();
  if (from && to) return `custom:${from}:${to}`;
  return `period:${input.period?.trim() || "30d"}`;
}

export function portfolioWorkspaceCacheTag(workspaceId: string): string {
  return `portfolio-ws-${workspaceId}`;
}

/** Invalida caches de portfolio que incluem este workspace. */
export function invalidatePortfolioCachesForWorkspace(workspaceId: string): void {
  safeRevalidateTag(portfolioWorkspaceCacheTag(workspaceId));
}

export async function getCachedPortfolioSummary(
  userId: string,
  activeWorkspaceId: string,
  portfolioParam: string,
  periodInput: PeriodInput | undefined,
  workspaceIds: string[],
): Promise<PortfolioSummary | null> {
  const periodKey = periodCacheKey(periodInput);
  const wsKey = [...workspaceIds].sort().join(",");

  return unstable_cache(
    async () =>
      buildPortfolioSummary(
        userId,
        activeWorkspaceId,
        portfolioParam,
        periodInput,
      ),
    ["portfolio-summary", userId, portfolioParam, periodKey, wsKey],
    {
      revalidate: PORTFOLIO_TTL_SEC,
      tags: workspaceIds.map(portfolioWorkspaceCacheTag),
    },
  )();
}
