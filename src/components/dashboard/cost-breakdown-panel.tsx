"use client";

import { Sensitive } from "@/components/privacy-mode";
import { cn } from "@/lib/utils";
import type { CostBreakdown } from "@/lib/metrics";

export function CostBreakdownPanel({ data }: { data: CostBreakdown }) {
  const base = Math.max(data.revenue, data.totalCosts, 1);
  const realCosts = data.items.filter((i) => !i.informative);
  const informative = data.items.filter((i) => i.informative);
  const profitPositive = data.netProfit >= 0;

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Repartição de custos</h2>
        <Sensitive className="text-xs tabular-nums text-muted-foreground">
          {data.totalCostsFmt}
        </Sensitive>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2 border-b border-border pb-3">
        <span className="text-[13px] text-muted-foreground">Faturamento</span>
        <Sensitive className="text-sm font-semibold tabular-nums">
          {data.revenueFmt}
        </Sensitive>
      </div>

      {realCosts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Sem custos registados neste período.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {realCosts.map((item) => {
            const pct = Math.min(100, (item.value / base) * 100);
            const ofRevenue =
              data.revenue > 0
                ? `${((item.value / data.revenue) * 100).toFixed(0)}%`
                : null;
            return (
              <li key={item.key}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate text-muted-foreground">
                    {item.label}
                    {ofRevenue && (
                      <span className="ml-1.5 text-xs text-muted-foreground/70">
                        {ofRevenue}
                      </span>
                    )}
                  </span>
                  <Sensitive className="shrink-0 font-medium tabular-nums">
                    {item.valueFmt}
                  </Sensitive>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/35"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex items-baseline justify-between gap-2 border-t border-border pt-3">
        <span className="text-[13px] font-medium">Custos totais</span>
        <Sensitive className="text-sm font-semibold tabular-nums">
          {data.totalCostsFmt}
        </Sensitive>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <span className="text-[13px] font-medium">Lucro líquido</span>
        <Sensitive
          className={cn(
            "text-base font-semibold tabular-nums",
            profitPositive ? "text-positive" : "text-negative",
          )}
        >
          {data.netProfitFmt}
        </Sensitive>
      </div>

      {informative.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          {informative.map((item) => (
            <div
              key={item.key}
              className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground"
            >
              <span>{item.label} (já na receita líquida)</span>
              <Sensitive className="tabular-nums">{item.valueFmt}</Sensitive>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
