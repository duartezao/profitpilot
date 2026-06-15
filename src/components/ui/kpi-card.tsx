import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/privacy-mode";
import { Sparkline } from "@/components/ui/sparkline";

export function KpiCard({
  label,
  value,
  title,
  delta,
  trend,
}: {
  label: string;
  value: string;
  /** Valor exato/completo para tooltip (quando `value` é compacto) */
  title?: string;
  /** Variação em %, ex.: 18.6 ou -4.8 (opcional) */
  delta?: number;
  /** Série para o sparkline (opcional) */
  trend?: number[];
}) {
  const positive = (delta ?? 0) >= 0;

  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface p-5">
      <p className="truncate text-[13px] font-medium text-muted-foreground">
        {label}
      </p>
      <Sensitive
        title={title ?? value}
        className="mt-1 block truncate text-2xl font-semibold tabular-nums sm:text-3xl"
      >
        {value}
      </Sensitive>

      <div className="mt-2 flex items-center justify-between">
        {delta !== undefined ? (
          <Sensitive
            className={cn(
              "inline-flex items-center gap-0.5 text-sm font-medium tabular-nums",
              positive ? "text-positive" : "text-negative",
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(delta).toFixed(1)}%
          </Sensitive>
        ) : (
          <span />
        )}
        {trend && (
          <div data-sensitive-chart>
            <Sparkline data={trend} />
          </div>
        )}
      </div>
    </div>
  );
}
