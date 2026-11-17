import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/privacy-mode";
import { Sparkline } from "@/components/ui/sparkline";
import { Card } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  title,
  delta,
  trend,
  hero: _hero = false,
}: {
  label: string;
  value: string;
  /** Valor exato/completo para tooltip (quando `value` é compacto) */
  title?: string;
  /** Variação em %, ex.: 18.6 ou -4.8 (opcional) */
  delta?: number;
  /** Série para o sparkline (opcional) */
  trend?: number[];
  /** @deprecated Combo 3 — cards clean iguais. */
  hero?: boolean;
}) {
  const positive = (delta ?? 0) >= 0;
  const significant = Math.abs(delta ?? 0) >= 10;

  return (
    <Card className={cn("relative min-w-0 overflow-hidden p-4 sm:p-5")}>
      <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
        {label}
      </p>
      <Sensitive
        title={title ?? value}
        className="mt-1 block truncate text-[1.75rem] font-semibold tabular-nums leading-none tracking-[-0.025em] sm:text-[2rem]"
      >
        {value}
      </Sensitive>

      <div className="mt-2 flex items-center justify-between">
        {delta !== undefined ? (
          <Sensitive
            className={cn(
              "inline-flex items-center gap-0.5 text-sm font-medium tabular-nums",
              significant
                ? positive
                  ? "text-positive"
                  : "text-negative"
                : "text-muted-foreground",
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(delta).toFixed(1).replace(".", ",")}%
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
    </Card>
  );
}
