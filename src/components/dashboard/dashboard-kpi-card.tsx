import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/privacy-mode";
import { Sparkline } from "@/components/ui/sparkline";
import type { SummaryKpi } from "@/lib/metrics";

/** Labels onde a cor do delta importa mesmo com variação pequena. */
const CRITICAL_DELTA_LABELS = new Set([
  "Net Profit",
  "ROAS",
  "Margem %",
  "POAS",
]);

const DELTA_COLOR_THRESHOLD = 10;

function formatDelta(delta: number, isPoints?: boolean) {
  const abs = Math.abs(delta).toFixed(1).replace(".", ",");
  return isPoints ? `${abs} pp` : `${abs}%`;
}

function periodFromDeltaLabel(label?: string): string | null {
  if (!label) return null;
  const cleaned = label
    .replace(/^var\.?\s*%?\s*vs\s+/i, "")
    .replace(/^vs\s+/i, "")
    .trim();
  return cleaned || null;
}

function deltaTone(
  delta: number,
  label: string,
  inverted?: boolean,
): "positive" | "negative" | "muted" {
  const rawPositive = delta >= 0;
  const businessPositive = inverted ? !rawPositive : rawPositive;
  const significant =
    CRITICAL_DELTA_LABELS.has(label) ||
    Math.abs(delta) >= DELTA_COLOR_THRESHOLD;
  if (!significant) return "muted";
  return businessPositive ? "positive" : "negative";
}

type DashboardKpiCardProps = SummaryKpi & {
  layout?: "store" | "workspace";
  emphasis?: boolean;
  density?: "primary" | "secondary";
};

/** KPI estilo Apple Stocks — valor grande, delta tipográfico, sem chrome. */
export function DashboardKpiCard({
  label,
  value,
  title,
  delta,
  deltaLabel,
  deltaIsPoints,
  deltaInverted,
  trend,
  layout = "workspace",
  density = "primary",
}: DashboardKpiCardProps) {
  const isStore = layout === "store";
  const isSecondary = density === "secondary";
  const rawPositive = (delta ?? 0) >= 0;
  const tone =
    delta !== undefined ? deltaTone(delta, label, deltaInverted) : "muted";
  const period = periodFromDeltaLabel(deltaLabel);

  const deltaTitle =
    delta !== undefined
      ? [`${rawPositive ? "+" : "−"}${formatDelta(delta, deltaIsPoints)}`, period]
          .filter(Boolean)
          .join(" · ")
      : undefined;

  return (
    <div
      className={cn(
        "glass relative flex h-full flex-col overflow-hidden rounded-[20px]",
        isSecondary ? "px-4 py-3.5" : "px-5 py-5 sm:px-6 sm:py-6",
      )}
    >
      <p
        className={cn(
          "truncate font-medium tracking-[-0.01em] text-muted-foreground",
          isSecondary ? "text-[12px]" : "text-[13px]",
        )}
      >
        {label}
      </p>

      <Sensitive
        title={title ?? value}
        className={cn(
          "mt-2 block min-w-0 font-semibold tabular-nums leading-[1.1] tracking-[-0.03em] [overflow-wrap:anywhere]",
          isSecondary
            ? "text-[clamp(1.05rem,3.6vw,1.35rem)]"
            : "text-[clamp(1.15rem,4.2vw,2.25rem)]",
        )}
      >
        {value}
      </Sensitive>

      {delta !== undefined && (
        <div
          className={cn(
            "mt-2 flex min-w-0 items-baseline gap-1.5",
            isStore && "flex-col items-start gap-0.5",
          )}
        >
          <Sensitive
            title={deltaTitle}
            className={cn(
              "text-[13px] font-semibold tabular-nums tracking-[-0.01em]",
              tone === "positive" && "text-positive",
              tone === "negative" && "text-negative",
              tone === "muted" && "text-muted-foreground",
            )}
          >
            {rawPositive ? "+" : "−"}
            {formatDelta(delta, deltaIsPoints)}
          </Sensitive>
          {period && (
            <span className="truncate text-[12px] text-muted-foreground">
              vs {period}
            </span>
          )}
        </div>
      )}

      {Boolean(trend?.length) && !isSecondary && (
        <div className="mt-auto pt-5" data-sensitive-chart>
          <Sparkline
            data={trend!}
            width={140}
            height={36}
            className="w-full max-w-none"
            color={
              tone === "positive"
                ? "var(--positive)"
                : tone === "negative"
                  ? "var(--negative)"
                  : "var(--muted-foreground)"
            }
          />
        </div>
      )}
    </div>
  );
}
