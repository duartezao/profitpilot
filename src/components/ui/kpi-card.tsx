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
  title?: string;
  delta?: number;
  trend?: number[];
  hero?: boolean;
}) {
  const positive = (delta ?? 0) >= 0;
  const significant = Math.abs(delta ?? 0) >= 10;

  return (
    <Card className="relative flex min-w-0 flex-col overflow-hidden rounded-[20px] px-5 py-5 sm:px-6 sm:py-6">
      <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
        {label}
      </p>
      <Sensitive
        title={title ?? value}
        className="mt-2 block min-w-0 text-[clamp(1.15rem,4.2vw,2.25rem)] font-semibold tabular-nums leading-[1.1] tracking-[-0.03em] [overflow-wrap:anywhere]"
      >
        {value}
      </Sensitive>

      <div className="mt-2 flex items-end justify-between gap-2">
        {delta !== undefined ? (
          <Sensitive
            className={cn(
              "text-[13px] font-semibold tabular-nums tracking-[-0.01em]",
              significant
                ? positive
                  ? "text-positive"
                  : "text-negative"
                : "text-muted-foreground",
            )}
          >
            {positive ? "+" : "−"}
            {Math.abs(delta).toFixed(1).replace(".", ",")}%
          </Sensitive>
        ) : (
          <span />
        )}
        {trend && (
          <div data-sensitive-chart>
            <Sparkline
              data={trend}
              color={
                significant
                  ? positive
                    ? "var(--positive)"
                    : "var(--negative)"
                  : "var(--muted-foreground)"
              }
            />
          </div>
        )}
      </div>
    </Card>
  );
}
