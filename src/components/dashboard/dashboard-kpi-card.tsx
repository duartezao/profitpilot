import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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

/** Limiar (%) acima do qual o delta ganha cor (evita semáforo em tudo). */
const DELTA_COLOR_THRESHOLD = 10;

function formatDelta(delta: number, isPoints?: boolean) {
  const abs = Math.abs(delta).toFixed(1).replace(".", ",");
  return isPoints ? `${abs} pp` : `${abs}%`;
}

/** Extrai só o período de comparação (ex. "1–7 Set 2026"). */
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
  /** Realça o card (KPI principal). */
  emphasis?: boolean;
  /** Variante compacta para métricas secundárias. */
  density?: "primary" | "secondary";
};

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
  emphasis = false,
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

  const deltaBlock = delta !== undefined && (
    <Sensitive
      title={deltaTitle}
      className={cn(
        "mt-1.5 text-xs tabular-nums sm:text-sm",
        tone === "positive" && "text-positive",
        tone === "negative" && "text-negative",
        tone === "muted" && "text-muted-foreground",
        isStore ? "block leading-snug" : "inline-flex max-w-full items-center gap-0.5 truncate",
      )}
    >
      <span className="inline-flex items-center gap-0.5">
        {rawPositive ? (
          <ArrowUpRight className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        ) : (
          <ArrowDownRight className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        )}
        <span>
          {rawPositive ? "+" : "−"}
          {formatDelta(delta, deltaIsPoints)}
        </span>
      </span>
      {period && (
        <span
          className={cn(
            "font-normal text-muted-foreground",
            isStore ? "mt-0.5 block truncate" : "ml-1 truncate",
          )}
        >
          {isStore ? `vs ${period}` : `· vs ${period}`}
        </span>
      )}
    </Sensitive>
  );

  const valueClassName = cn(
    "mt-1 block font-semibold tabular-nums leading-tight",
    isSecondary
      ? "text-base sm:text-lg"
      : emphasis
        ? "text-2xl sm:text-3xl"
        : "text-xl sm:text-2xl",
  );

  // `emphasis` só aumenta tipografia — sem borda accent (accent raro).
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-lg border border-border bg-surface",
        isSecondary ? "p-3.5 sm:p-4" : "p-4 sm:p-5",
      )}
    >
      <p
        className={cn(
          "truncate font-medium text-muted-foreground",
          isSecondary ? "text-xs" : "text-xs sm:text-[13px]",
        )}
      >
        {label}
      </p>
      <Sensitive title={title ?? value} className={valueClassName}>
        {value}
      </Sensitive>
      {deltaBlock}

      {Boolean(trend?.length) && !isSecondary && (
        <div className="mt-2 flex justify-end sm:mt-3" data-sensitive-chart>
          <Sparkline data={trend!} width={80} height={22} />
        </div>
      )}
    </div>
  );
}
