"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/privacy-mode";
import type { ProfitChartPoint, ProfitChartSeries } from "@/lib/metrics";

function compactAxisValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

function ProfitTooltip({
  active,
  payload,
  multiStore,
}: {
  active?: boolean;
  payload?: Array<{ payload: ProfitChartPoint }>;
  multiStore?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ProfitChartPoint;
  const positive = point.profit >= 0;
  const slices = point.byStore ?? [];

  return (
    <div className="max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <p className="text-xs text-muted-foreground">{point.dateLabel}</p>
      {multiStore ? (
        <>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Total
          </p>
          <p
            className={cn(
              "font-semibold tabular-nums",
              positive ? "text-positive" : "text-negative",
            )}
          >
            {point.profitFmt}
          </p>
          {slices.length > 0 && (
            <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
              {slices.map((s) => (
                <li
                  key={s.storeId}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                      aria-hidden
                    />
                    <Sensitive as="span" className="truncate">
                      {s.name}
                    </Sensitive>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums font-medium",
                      s.profit >= 0 ? "text-foreground" : "text-negative",
                    )}
                  >
                    {s.profitFmt}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p
          className={cn(
            "mt-0.5 font-semibold tabular-nums",
            positive ? "text-positive" : "text-negative",
          )}
        >
          {point.profitFmt}
        </p>
      )}
      {point.hasNote && point.notePreview && (
        <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
          {point.didScale && (
            <span className="mr-1 font-medium text-accent">Scale ·</span>
          )}
          {point.notePreview}
        </p>
      )}
    </div>
  );
}

function NoteDot(props: {
  cx?: number;
  cy?: number;
  payload?: ProfitChartPoint;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload?.hasNote) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="var(--warning)"
      stroke="var(--surface)"
      strokeWidth={2}
    />
  );
}

function ChartLegend({ series }: { series: ProfitChartSeries[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <div
          key={s.storeId}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: s.color }}
            aria-hidden
          />
          <Sensitive>{s.name}</Sensitive>
        </div>
      ))}
    </div>
  );
}

export function ProfitChart({
  data,
  series,
}: {
  data: ProfitChartPoint[];
  series?: ProfitChartSeries[];
}) {
  const multiStore = Boolean(series && series.length > 1);

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

  const chartProps = {
    data,
    margin: { top: 8, right: 8, left: 0, bottom: 0 },
  };

  const axes = (
    <>
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
        content={<ProfitTooltip multiStore={multiStore} />}
        cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
      />
    </>
  );

  return (
    <div className="mt-4 min-w-0" data-sensitive-chart>
      <div className="h-52 w-full min-w-0 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          {multiStore && series ? (
            <LineChart {...chartProps}>
              {axes}
              {series.map((s) => (
                <Line
                  key={s.storeId}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: s.color,
                    stroke: "var(--surface)",
                    strokeWidth: 2,
                  }}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart {...chartProps}>
              {axes}
              <Area
                type="monotone"
                dataKey="profit"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="var(--accent)"
                fillOpacity={0.12}
                dot={<NoteDot />}
                activeDot={{
                  r: 4,
                  fill: "var(--accent)",
                  stroke: "var(--surface)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      {multiStore && series && <ChartLegend series={series} />}
    </div>
  );
}
