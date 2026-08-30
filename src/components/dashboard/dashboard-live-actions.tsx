"use client";

import { LastSyncBadge } from "@/components/last-sync-badge";
import { LiveRefreshButton } from "@/components/live-refresh-button";

export function DashboardLiveActions({
  lastSyncedAt,
  fetching = false,
}: {
  lastSyncedAt?: string | null;
  fetching?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <LastSyncBadge lastSyncedAt={lastSyncedAt} fetching={fetching} />
      <LiveRefreshButton />
    </div>
  );
}
