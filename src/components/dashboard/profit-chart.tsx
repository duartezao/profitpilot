"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { useWorkspace } from "@/components/workspace-context";
import {
  hrefDashboardStore,
  persistActiveStore,
} from "@/lib/scope-query";
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

function useOpenStoreDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspaceId } = useWorkspace();

  return useCallback(
    (storeId: string) => {
      if (workspaceId) persistActiveStore(workspaceId, storeId);
      router.push(hrefDashboardStore(storeId, searchParams));
    },
    [router, searchParams, workspaceId],
  );
}

/** Placeholder com a mesma altura do gráfico (evita salto de layout). */
export function ProfitChartSkeleton({
  multiStore = false,
}: {
  multiStore?: boolean;
}) {
  return (
    <div className="mt-4 min-w-0 animate-pulse" aria-hidden>
      {multiStore && (
        <div className="mb-3 flex justify-end">
          <div className="h-9 w-40 rounded-lg bg-muted" />
        </div>
      )}
      <div className="h-52 w-full rounded-lg bg-muted/70 sm:h-64" />
      {multiStore && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-3 w-16 rounded bg-muted" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Um dia só: barras por loja (CSS) ou valor em destaque. */
function SingleDayProfitView({
  point,
  series,
  multiStore,
  showPerStore,
  onStoreClick,
}: {
  point: ProfitChartPoint;
  series?: ProfitChartSeries[];
  multiStore: boolean;
  showPerStore: boolean;
  onStoreClick?: (storeId: string) => void;
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
          const clickable = Boolean(onStoreClick);
          const inner = (
            <>
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
                  className="w-full max-w-[2.75rem] rounded-t-md transition-opacity"
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
            </>
          );
          if (!clickable) {
            return (
              <div
                key={b.storeId}
                className="flex min-w-[3.25rem] flex-1 flex-col items-center justify-end gap-2"
                title={`${b.name}: ${b.profitFmt}`}
              >
                {inner}
              </div>
            );
          }
          return (
            <button
              key={b.storeId}
              type="button"
              onClick={() => onStoreClick?.(b.storeId)}
              title={`Abrir ${b.name}`}
              className="flex min-w-[3.25rem] flex-1 flex-col items-center justify-end gap-2 rounded-lg outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-accent"
            >
              {inner}
            </button>
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
          {slices.map((s) => {
            const row = (
              <>
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
              </>
            );
            if (!onStoreClick) {
              return (
                <li
                  key={s.storeId}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  {row}
                </li>
              );
            }
            return (
              <li key={s.storeId}>
                <button
                  type="button"
                  onClick={() => onStoreClick(s.storeId)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {row}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProfitTooltip({
  active,
  payload,
  multiStore,
  onStoreClick,
}: {
  active?: boolean;
  payload?: Array<{ payload: ProfitChartPoint }>;
  multiStore?: boolean;
  onStoreClick?: (storeId: string) => void;
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
              {slices.map((s) => {
                const row = (
                  <>
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
                  </>
                );
                if (!onStoreClick) {
                  return (
                    <li
                      key={s.storeId}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      {row}
                    </li>
                  );
                }
                return (
                  <li key={s.storeId}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStoreClick(s.storeId);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-md text-left text-xs outline-none hover:bg-muted"
                    >
                      {row}
                    </button>
                  </li>
                );
              })}
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

function ChartLegend({
  series,
  onStoreClick,
}: {
  series: ProfitChartSeries[];
  onStoreClick?: (storeId: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {series.map((s) => {
        const body = (
          <>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <Sensitive>{s.name}</Sensitive>
          </>
        );
        if (!onStoreClick) {
          return (
            <div
              key={s.storeId}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              {body}
            </div>
          );
        }
        return (
          <button
            key={s.storeId}
            type="button"
            onClick={() => onStoreClick(s.storeId)}
            className="flex items-center gap-1.5 rounded-md text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
          >
            {body}
          </button>
        );
      })}
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
  const openStore = useOpenStoreDashboard();
  const onStoreClick = multiStore ? openStore : undefined;

  const tickInterval = useMemo(() => {
    if (data.length <= 10) return 0;
    if (data.length <= 21) return 1;
    if (data.length <= 45) return 3;
    return Math.floor(data.length / 8);
  }, [data.length]);

  if (data.length === 0) {
    return (
      <div className="mt-4 flex h-52 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground sm:h-64">
        Sem dados no período selecionado.
      </div>
    );
  }

  const singleDay = data.length === 1;

  return (
    <div className="mt-4 min-w-0" data-sensitive-chart>
      {multiStore && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {onStoreClick ? (
            <p className="text-xs text-muted-foreground">
              Clica numa loja para abrir a dashboard.
            </p>
          ) : (
            <span />
          )}
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
            onStoreClick={onStoreClick}
          />
          {showPerStore && series && (
            <ChartLegend series={series} onStoreClick={onStoreClick} />
          )}
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
                    content={
                      <ProfitTooltip
                        multiStore={multiStore}
                        onStoreClick={onStoreClick}
                      />
                    }
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
                      style={
                        onStoreClick ? { cursor: "pointer" } : undefined
                      }
                      onClick={() => onStoreClick?.(s.storeId)}
                      activeDot={{
                        r: 4,
                        fill: s.color,
                        stroke: "var(--surface)",
                        strokeWidth: 2,
                        cursor: onStoreClick ? "pointer" : undefined,
                        onClick: () => onStoreClick?.(s.storeId),
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
                    content={
                      <ProfitTooltip
                        multiStore={multiStore}
                        onStoreClick={onStoreClick}
                      />
                    }
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
          {showPerStore && series && (
            <ChartLegend series={series} onStoreClick={onStoreClick} />
          )}
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
