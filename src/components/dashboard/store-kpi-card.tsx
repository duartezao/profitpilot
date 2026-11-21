import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/privacy-mode";
import type { SummaryKpi } from "@/lib/metrics";

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

/** Card legado (lojas) — tipografia limpa, sem ícones decorativos. */
export function StoreKpiCard({
  label,
  value,
  title,
  delta,
  deltaLabel,
  deltaIsPoints,
}: SummaryKpi) {
  const positive = (delta ?? 0) >= 0;
  const significant = Math.abs(delta ?? 0) >= 10 || label === "Net Profit";
  const period = periodFromDeltaLabel(deltaLabel);

  return (
    <div className="glass flex min-w-0 flex-col rounded-[20px] px-5 py-5 sm:px-6 sm:py-6">
      <p className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
        {label}
      </p>
      <Sensitive
        title={title ?? value}
        className="mt-2 block min-w-0 text-[clamp(1.15rem,4.2vw,2.25rem)] font-semibold tabular-nums leading-[1.1] tracking-[-0.03em] [overflow-wrap:anywhere]"
      >
        {value}
      </Sensitive>
      {delta !== undefined && (
        <Sensitive
          className={cn(
            "mt-3 block text-xs tabular-nums",
            significant
              ? positive
                ? "text-positive"
                : "text-negative"
              : "text-muted-foreground",
          )}
        >
          {positive ? "+" : "−"}
          {formatDelta(delta, deltaIsPoints)}
          {period ? ` vs ${period}` : null}
        </Sensitive>
      )}
    </div>
  );
}
