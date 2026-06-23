"use client";

import { Suspense } from "react";
import { PeriodSelector } from "@/components/period-selector";
import { useAppViewModeContext } from "@/components/app-view-mode-provider";

export function TopbarPeriodSelector({
  className,
  fullWidth,
}: {
  className?: string;
  fullWidth?: boolean;
}) {
  const { mode } = useAppViewModeContext();
  if (mode === "operations") return null;
  return (
    <Suspense
      fallback={
        <span className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground">
          Período
        </span>
      }
    >
      <PeriodSelector className={className} fullWidth={fullWidth} />
    </Suspense>
  );
}
