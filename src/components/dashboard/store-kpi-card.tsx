import {
  Euro,
  Percent,
  Target,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/privacy-mode";
import type { KpiIcon, SummaryKpi } from "@/lib/metrics";

const iconMap: Record<KpiIcon, typeof Euro> = {
  euro: Euro,
  percent: Percent,
  target: Target,
  trending: TrendingUp,
};

function formatDelta(delta: number, isPoints?: boolean) {
  const abs = Math.abs(delta).toFixed(1).replace(".", ",");
  return isPoints ? `${abs} pp` : `${abs}%`;
}

export function StoreKpiCard({
  label,
  value,
  title,
  delta,
  deltaLabel,
  deltaIsPoints,
  icon,
}: SummaryKpi) {
  const Icon = icon ? iconMap[icon] : null;
  const positive = (delta ?? 0) >= 0;

  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <Sensitive
            title={title ?? value}
            className="mt-1 block truncate text-xl font-semibold tabular-nums sm:text-2xl lg:text-3xl"
          >
            {value}
          </Sensitive>
        </div>
        {Icon && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10"
          >
            <Icon className="h-5 w-5 text-accent" />
          </div>
        )}
      </div>
      {delta !== undefined && deltaLabel && (
        <Sensitive
          className={cn(
            "mt-3 block text-xs tabular-nums",
            positive ? "text-positive" : "text-negative",
          )}
        >
          {positive ? "+" : "−"} {formatDelta(delta, deltaIsPoints)} vs{" "}
          {deltaLabel.replace(/^vs\s+/i, "")}
        </Sensitive>
      )}
    </div>
  );
}
