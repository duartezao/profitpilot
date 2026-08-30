"use client";

import { RefreshCw } from "lucide-react";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { cn } from "@/lib/utils";

export function LiveRefreshButton({
  className,
  label = "Actualizar",
}: {
  className?: string;
  label?: string;
}) {
  const { refresh, refreshing } = useLiveRefresh();

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={refreshing}
      aria-label={label}
      className={cn(
        "hidden lg:inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60",
        className,
      )}
    >
      <RefreshCw
        className={cn("h-4 w-4 stroke-[1.5]", refreshing && "animate-spin")}
      />
      <span>{refreshing ? "A actualizar…" : label}</span>
    </button>
  );
}
