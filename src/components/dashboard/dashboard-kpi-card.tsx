import {
  ArrowDownRight,
  ArrowUpRight,
  Euro,
  Percent,
  Target,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/privacy-mode";
import { Sparkline } from "@/components/ui/sparkline";
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

type DashboardKpiCardProps = SummaryKpi & {
  /** Vista loja — ícone canto superior direito + comparação com período anterior */
  layout?: "store" | "workspace";
  /** Realça o card (borda accent + valor maior) — usado no KPI principal. */
  emphasis?: boolean;
};

export function DashboardKpiCard({
  label,
  value,
  title,
  delta,
  deltaLabel,
  deltaIsPoints,
  deltaInverted,
  icon,
  trend,
  layout = "workspace",
  emphasis = false,
}: DashboardKpiCardProps) {
  const Icon = icon ? iconMap[icon] : null;
  const isStore = layout === "store";
  const rawPositive = (delta ?? 0) >= 0;
  const positive = deltaInverted ? !rawPositive : rawPositive;
  const showSparkline = Boolean(trend?.length) && !Icon;

  const deltaTitle =
    delta !== undefined
      ? [
          `${rawPositive ? "+" : "−"} ${formatDelta(delta, deltaIsPoints)}`,
          deltaLabel,
        ]
          .filter(Boolean)
          .join(" ")
      : undefined;

  const deltaBlock = delta !== undefined && (
    <Sensitive
      title={deltaTitle}
      className={cn(
        "mt-1.5 text-xs font-medium tabular-nums sm:text-sm",
        positive ? "text-positive" : "text-negative",
        isStore ? "block leading-snug" : "inline-flex max-w-full items-center gap-0.5 truncate",
      )}
    >
      <span className={cn(isStore ? "inline-flex items-center gap-0.5" : "inline-flex items-center gap-0.5 truncate")}>
        {rawPositive ? (
          <ArrowUpRight className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        ) : (
          <ArrowDownRight className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        )}
        <span className={isStore ? "" : "truncate"}>
          {rawPositive ? "+" : "−"} {formatDelta(delta, deltaIsPoints)}
        </span>
      </span>
      {isStore && deltaLabel && (
        <span className="mt-0.5 block truncate font-normal text-muted-foreground">
          {deltaLabel}
          <span className="hidden sm:inline"> — não é euros</span>
        </span>
      )}
    </Sensitive>
  );

  if (isStore && Icon) {
    return (
      <div className="relative flex h-full min-w-0 flex-col rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 sm:right-5 sm:top-5">
          <Icon className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0 pr-12">
          <p className="truncate text-[13px] font-medium text-muted-foreground">
            {label}
          </p>
          <Sensitive
            title={title ?? value}
            className="mt-1 block truncate text-xl font-semibold tabular-nums sm:text-2xl lg:text-3xl"
          >
            {value}
          </Sensitive>
          {deltaBlock}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col rounded-lg border bg-surface p-3.5 sm:p-4 lg:p-5",
        emphasis ? "border-accent/40 ring-1 ring-accent/15" : "border-border",
      )}
    >
      <div className={cn("flex min-w-0 gap-2.5 sm:gap-3", Icon && "items-start")}>
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 sm:h-10 sm:w-10">
            <Icon className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-xs font-medium sm:text-[13px]",
              emphasis ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </p>
          <Sensitive
            title={title ?? value}
            className={cn(
              "mt-0.5 block truncate font-semibold tabular-nums leading-tight sm:mt-1",
              emphasis
                ? "text-2xl sm:text-3xl xl:text-4xl"
                : "text-lg sm:text-xl md:text-2xl xl:text-3xl",
            )}
          >
            {value}
          </Sensitive>
          {!isStore && deltaBlock}
        </div>
      </div>

      {showSparkline && trend && (
        <div className="mt-2 flex justify-end sm:mt-3" data-sensitive-chart>
          <Sparkline data={trend} width={80} height={22} />
        </div>
      )}
    </div>
  );
}
