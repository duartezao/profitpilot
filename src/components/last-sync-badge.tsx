"use client";

import { formatLastSyncLabel } from "@/lib/format-last-sync-label";

export function LastSyncBadge({
  lastSyncedAt,
  fetching = false,
  emptyLabel = "Sem sync registado",
}: {
  lastSyncedAt?: string | null;
  fetching?: boolean;
  emptyLabel?: string;
}) {
  const label = formatLastSyncLabel(lastSyncedAt);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span
          className={
            fetching
              ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75"
              : "hidden"
          }
        />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
      </span>
      <span className="tabular-nums">
        {label ? `Último sync: ${label}` : emptyLabel}
      </span>
    </div>
  );
}
