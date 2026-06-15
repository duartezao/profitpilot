"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import type { ProfitChartPoint } from "@/lib/metrics";

function compactAxisValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

function ProfitTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ProfitChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ProfitChartPoint;
  const positive = point.profit >= 0;

  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <p className="text-xs text-muted-foreground">{point.dateLabel}</p>
      <p
        className={cn(
          "mt-0.5 font-semibold tabular-nums",
          positive ? "text-positive" : "text-negative",
        )}
      >
        {point.profitFmt}
      </p>
    </div>
  );
}

export function ProfitChart({ data }: { data: ProfitChartPoint[] }) {
  const tickInterval = useMemo(() => {
    if (data.length <= 10) return 0;
    if (data.length <= 21) return 1;
    if (data.length <= 45) return 3;
    return Math.floor(data.length / 8);
  }, [data.length]);

  if (data.length === 0) {
    return (
      <div className="mt-4 flex h-52 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Sem dados no período selecionado.
      </div>
    );
  }

  return (
    <div className="mt-4 min-w-0" data-sensitive-chart>
      <div className="h-52 w-full min-w-0 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval={tickInterval}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              width={44}
              tickFormatter={compactAxisValue}
            />
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
            <Tooltip
              content={<ProfitTooltip />}
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="profit"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="var(--accent)"
              fillOpacity={0.12}
              dot={false}
              activeDot={{
                r: 4,
                fill: "var(--accent)",
                stroke: "var(--surface)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
