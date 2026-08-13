"use client";

import { useMemo, useState } from "react";
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
import type {
  ProfitChartPoint,
  ProfitChartSeries,
  ProfitChartStoreSlice,
} from "@/lib/metrics";

type MultiStoreView = "stores" | "total";

function compactAxisValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

/** Um dia só: barras por loja (CSS, sem Recharts) ou valor em destaque. */
function SingleDayProfitView({
  point,
  series,
  multiStore,
  showPerStore,
}: {
  point: ProfitChartPoint;
  series?: ProfitChartSeries[];
  multiStore: boolean;
  showPerStore: boolean;
}) {
  const bars = useMemo(() => {
    if (point.byStore?.length) return point.byStore;
    if (!series?.length) return [] as ProfitChartStoreSlice[];
    return series.map((s) => {
      const raw = (point as ProfitChartPoint & Record<string, unknown>)[s.key];
      const profit = typeof raw === "number" ? raw : 0;
      return {
        storeId: s.storeId,
        name: s.name,
        color: s.color,
        profit,
        profitFmt: point.profitFmt,
      };
    });
  }, [point, series]);

  if (multiStore && showPerStore && bars.length > 0) {
    const maxAbs = Math.max(...bars.map((b) => Math.abs(b.profit)), 1);
    return (
      <div className="flex h-52 items-end gap-2 overflow-x-auto pb-1 sm:h-64 sm:gap-3">
        {bars.map((b) => {
          const heightPct = Math.max(4, (Math.abs(b.profit) / maxAbs) * 100);
          const negative = b.profit < 0;
          return (
            <div
              key={b.storeId}
              className="flex min-w-[3.25rem] flex-1 flex-col items-center justify-end gap-2"
              title={`${b.name}: ${b.profitFmt}`}
            >
              <span
                className={cn(
                  "text-[11px] tabular-nums font-medium",
                  negative ? "text-negative" : "text-foreground",
                )}
              >
                {b.profitFmt}
              </span>
              <div className="flex h-36 w-full max-w-[3.5rem] items-end justify-center sm:h-44">
                <div
                  className="w-full max-w-[2.75rem] rounded-t-md"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: b.color,
                    opacity: negative ? 0.55 : 0.9,
                  }}
                />
              </div>
              <Sensitive
                as="span"
                className="max-w-full truncate text-center text-[11px] text-muted-foreground"
              >
                {b.name}
              </Sensitive>
            </div>
          );
        })}
      </div>
    );
  }

  const positive = point.profit >= 0;
  const slices = point.byStore ?? [];

  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-4 py-6 sm:min-h-64">
      <p className="text-xs text-muted-foreground">{point.dateLabel}</p>
      <p
        className={cn(
          "text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl",
          positive ? "text-positive" : "text-negative",
        )}
      >
        {point.profitFmt}
      </p>
      {multiStore && slices.length > 0 && (
        <ul className="mt-1 w-full max-w-sm space-y-1.5 border-t border-border pt-3">
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
    </div>
  );
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
      {point.consolidated === false && (
        <p className="mt-2 text-xs text-muted-foreground">
          Lucro provisório (janela de refunds)
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

function MultiStoreViewToggle({
  view,
  onChange,
}: {
  view: MultiStoreView;
  onChange: (next: MultiStoreView) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-border p-0.5"
      role="group"
      aria-label="Vista do gráfico de lucro"
    >
      <button
        type="button"
        aria-pressed={view === "stores"}
        onClick={() => onChange("stores")}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium",
          view === "stores"
            ? "bg-accent/10 text-accent"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        Por loja
      </button>
      <button
        type="button"
        aria-pressed={view === "total"}
        onClick={() => onChange("total")}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium",
          view === "total"
            ? "bg-accent/10 text-accent"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        Total
      </button>
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
  const [multiView, setMultiView] = useState<MultiStoreView>("stores");
  const showPerStore = multiStore && multiView === "stores";

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

  const singleDay = data.length === 1;

  return (
    <div className="mt-4 min-w-0" data-sensitive-chart>
      {multiStore && (
        <div className="mb-3 flex justify-end">
          <MultiStoreViewToggle view={multiView} onChange={setMultiView} />
        </div>
      )}
      {singleDay ? (
        <>
          <SingleDayProfitView
            point={data[0]}
            series={series}
            multiStore={multiStore}
            showPerStore={showPerStore}
          />
          {showPerStore && series && <ChartLegend series={series} />}
        </>
      ) : (
        <>
          <div className="h-52 w-full min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              {showPerStore && series ? (
                <LineChart
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
                    content={<ProfitTooltip multiStore={multiStore} />}
                    cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                  />
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
                    content={<ProfitTooltip multiStore={multiStore} />}
                    cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                  />
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
          {showPerStore && series && <ChartLegend series={series} />}
        </>
      )}
      {data.some((p) => p.consolidated === false) && (
        <p className="mt-2 text-xs text-muted-foreground">
          Dias recentes = lucro provisório (reembolsos ainda podem entrar).
        </p>
      )}
    </div>
  );
}
