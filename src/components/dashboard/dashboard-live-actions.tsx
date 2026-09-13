"use client";

import { LiveRefreshButton } from "@/components/live-refresh-button";

export function DashboardLiveActions() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <LiveRefreshButton />
    </div>
  );
}
