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
type ChartMetric = "profit" | "revenue";

type BarRow = {
  storeId: string;
  name: string;
  color: string;
  value: number;
  valueFmt: string;
};

function compactAxisValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

function compactBarLabel(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${Math.round(abs)}`;
}

function metricValue(
  point: ProfitChartPoint,
  metric: ChartMetric,
): { value: number; fmt: string } {
  if (metric === "revenue") {
    return {
      value: point.revenue ?? 0,
      fmt: point.revenueFmt ?? compactBarLabel(point.revenue ?? 0),
    };
  }
  return { value: point.profit, fmt: point.profitFmt };
}

function sliceValue(
  slice: ProfitChartStoreSlice,
  metric: ChartMetric,
): { value: number; fmt: string } {
  if (metric === "revenue") {
    return {
      value: slice.revenue ?? 0,
      fmt: slice.revenueFmt ?? compactBarLabel(slice.revenue ?? 0),
    };
  }
  return { value: slice.profit, fmt: slice.profitFmt };
}

function seriesDataKey(
  s: ProfitChartSeries,
  metric: ChartMetric,
): string {
  if (metric === "revenue") {
    return s.revenueKey || `r_${s.storeId}`;
  }
  return s.key;
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

function SegmentToggle<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { id: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex shrink-0 rounded-lg border border-border p-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:text-sm",
            value === opt.id
              ? "bg-accent/10 text-accent"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
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
      <div className="mb-3 flex justify-end gap-2">
        <div className="h-8 w-36 rounded-lg bg-muted sm:h-9 sm:w-40" />
        {multiStore && (
          <div className="h-8 w-32 rounded-lg bg-muted sm:h-9 sm:w-40" />
        )}
      </div>
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

/** Um dia: lista no mobile (sem overflow), barras no desktop. */
function SingleDayProfitView({
  point,
  series,
  multiStore,
  showPerStore,
  metric,
  onStoreClick,
}: {
  point: ProfitChartPoint;
  series?: ProfitChartSeries[];
  multiStore: boolean;
  showPerStore: boolean;
  metric: ChartMetric;
  onStoreClick?: (storeId: string) => void;
}) {
  const bars = useMemo((): BarRow[] => {
    if (point.byStore?.length) {
      return point.byStore.map((s) => {
        const { value, fmt } = sliceValue(s, metric);
        return {
          storeId: s.storeId,
          name: s.name,
          color: s.color,
          value,
          valueFmt: fmt,
        };
      });
    }
    if (!series?.length) return [];
    return series.map((s) => {
      const key = seriesDataKey(s, metric);
      const raw = (point as ProfitChartPoint & Record<string, unknown>)[key];
      const value = typeof raw === "number" ? raw : 0;
      return {
        storeId: s.storeId,
        name: s.name,
        color: s.color,
        value,
        valueFmt: compactBarLabel(value),
      };
    });
  }, [point, series, metric]);

  if (multiStore && showPerStore && bars.length > 0) {
    const maxAbs = Math.max(...bars.map((b) => Math.abs(b.value)), 1);

    return (
      <>
        {/* Mobile: ranking horizontal — cabe no ecrã */}
        <div className="space-y-2 sm:hidden">
          {bars.map((b) => {
            const widthPct = Math.max(4, (Math.abs(b.value) / maxAbs) * 100);
            const negative = b.value < 0;
            const rowCls =
              "flex w-full min-w-0 items-center gap-2 rounded-lg px-1 py-1.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-accent";
            const body = (
              <>
                <Sensitive
                  as="span"
                  className="w-[5.5rem] shrink-0 truncate text-xs text-muted-foreground"
                >
                  {b.name}
                </Sensitive>
                <div className="min-w-0 flex-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: b.color,
                        opacity: negative ? 0.55 : 0.9,
                      }}
                    />
                  </div>
                </div>
                <span
                  className={cn(
                    "w-14 shrink-0 text-right text-[11px] tabular-nums font-medium",
                    negative ? "text-negative" : "text-foreground",
                  )}
                  title={b.valueFmt}
                >
                  {compactBarLabel(b.value)}
                </span>
              </>
            );
            if (!onStoreClick) {
              return (
                <div key={b.storeId} className={rowCls}>
                  {body}
                </div>
              );
            }
            return (
              <button
                key={b.storeId}
                type="button"
                onClick={() => onStoreClick(b.storeId)}
                title={`Abrir ${b.name}`}
                className={rowCls}
              >
                {body}
              </button>
            );
          })}
        </div>

        {/* Desktop: barras verticais */}
        <div className="hidden h-64 min-w-0 items-end gap-3 overflow-x-auto pb-1 sm:flex">
          {bars.map((b) => {
            const heightPct = Math.max(4, (Math.abs(b.value) / maxAbs) * 100);
            const negative = b.value < 0;
            const inner = (
              <>
                <span
                  className={cn(
                    "text-[11px] tabular-nums font-medium",
                    negative ? "text-negative" : "text-foreground",
                  )}
                  title={b.valueFmt}
                >
                  {compactBarLabel(b.value)}
                </span>
                <div className="flex h-44 w-full max-w-[3.5rem] items-end justify-center">
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
              </>
            );
            if (!onStoreClick) {
              return (
                <div
                  key={b.storeId}
                  className="flex min-w-[3.25rem] flex-1 flex-col items-center justify-end gap-2"
                  title={`${b.name}: ${b.valueFmt}`}
                >
                  {inner}
                </div>
              );
            }
            return (
              <button
                key={b.storeId}
                type="button"
                onClick={() => onStoreClick(b.storeId)}
                title={`Abrir ${b.name}`}
                className="flex min-w-[3.25rem] flex-1 flex-col items-center justify-end gap-2 rounded-lg outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-accent"
              >
                {inner}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  const { value, fmt } = metricValue(point, metric);
  const positive = value >= 0;
  const slices = point.byStore ?? [];

  return (
    <div className="flex min-h-52 w-full min-w-0 flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border border-dashed border-border px-3 py-6 sm:min-h-64 sm:px-4">
      <p className="text-xs text-muted-foreground">{point.dateLabel}</p>
      <p
        className={cn(
          "max-w-full truncate text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl",
          metric === "profit"
            ? positive
              ? "text-positive"
              : "text-negative"
            : "text-foreground",
        )}
      >
        {fmt}
      </p>
      {multiStore && slices.length > 0 && (
        <ul className="mt-1 w-full max-w-sm space-y-1.5 border-t border-border pt-3">
          {slices.map((s) => {
            const sv = sliceValue(s, metric);
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
                    metric === "profit" && sv.value < 0
                      ? "text-negative"
                      : "text-foreground",
                  )}
                >
                  {sv.fmt}
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
  metric,
  onStoreClick,
}: {
  active?: boolean;
  payload?: Array<{ payload: ProfitChartPoint }>;
  multiStore?: boolean;
  metric: ChartMetric;
  onStoreClick?: (storeId: string) => void;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ProfitChartPoint;
  const { value, fmt } = metricValue(point, metric);
  const positive = value >= 0;
  const slices = point.byStore ?? [];
  const totalLabel = metric === "revenue" ? "Faturação" : "Lucro";

  return (
    <div className="max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <p className="text-xs text-muted-foreground">{point.dateLabel}</p>
      {multiStore ? (
        <>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {totalLabel}
          </p>
          <p
            className={cn(
              "font-semibold tabular-nums",
              metric === "profit"
                ? positive
                  ? "text-positive"
                  : "text-negative"
                : "text-foreground",
            )}
          >
            {fmt}
          </p>
          {slices.length > 0 && (
            <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
              {slices.map((s) => {
                const sv = sliceValue(s, metric);
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
                        metric === "profit" && sv.value < 0
                          ? "text-negative"
                          : "text-foreground",
                      )}
                    >
                      {sv.fmt}
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
            metric === "profit"
              ? positive
                ? "text-positive"
                : "text-negative"
              : "text-foreground",
          )}
        >
          {fmt}
        </p>
      )}
      {metric === "profit" && point.hasNote && point.notePreview && (
        <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
          {point.didScale && (
            <span className="mr-1 font-medium text-accent">Scale ·</span>
          )}
          {point.notePreview}
        </p>
      )}
      {metric === "profit" && point.consolidated === false && (
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

export function ProfitChart({
  data,
  series,
}: {
  data: ProfitChartPoint[];
  series?: ProfitChartSeries[];
}) {
  const multiStore = Boolean(series && series.length > 1);
  const [multiView, setMultiView] = useState<MultiStoreView>("stores");
  const [metric, setMetric] = useState<ChartMetric>("profit");
  const showPerStore = multiStore && multiView === "stores";
  const openStore = useOpenStoreDashboard();
  const onStoreClick = multiStore ? openStore : undefined;
  const totalDataKey = metric === "revenue" ? "revenue" : "profit";

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
    <div className="mt-4 min-w-0 overflow-hidden" data-sensitive-chart>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <SegmentToggle
          ariaLabel="Métrica do gráfico"
          value={metric}
          onChange={setMetric}
          options={[
            { id: "profit", label: "Lucro" },
            { id: "revenue", label: "Faturação" },
          ]}
        />
        {multiStore && (
          <SegmentToggle
            ariaLabel="Vista do gráfico"
            value={multiView}
            onChange={setMultiView}
            options={[
              { id: "stores", label: "Por loja" },
              { id: "total", label: "Total" },
            ]}
          />
        )}
      </div>
      {multiStore && onStoreClick && (
        <p className="mb-2 text-xs text-muted-foreground sm:mb-3">
          Clica numa loja para abrir a dashboard.
        </p>
      )}
      {singleDay ? (
        <>
          <SingleDayProfitView
            point={data[0]}
            series={series}
            multiStore={multiStore}
            showPerStore={showPerStore}
            metric={metric}
            onStoreClick={onStoreClick}
          />
          {showPerStore && series && (
            <div className="hidden sm:block">
              <ChartLegend series={series} onStoreClick={onStoreClick} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="h-52 w-full min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              {showPerStore && series ? (
                <LineChart
                  data={data}
                  margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
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
                    width={40}
                    tickFormatter={compactAxisValue}
                  />
                  {metric === "profit" && (
                    <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
                  )}
                  <Tooltip
                    content={
                      <ProfitTooltip
                        multiStore={multiStore}
                        metric={metric}
                        onStoreClick={onStoreClick}
                      />
                    }
                    cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                  />
                  {series.map((s) => (
                    <Line
                      key={`${s.storeId}-${metric}`}
                      type="monotone"
                      dataKey={seriesDataKey(s, metric)}
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
                  margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
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
                    width={40}
                    tickFormatter={compactAxisValue}
                  />
                  {metric === "profit" && (
                    <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
                  )}
                  <Tooltip
                    content={
                      <ProfitTooltip
                        multiStore={multiStore}
                        metric={metric}
                        onStoreClick={onStoreClick}
                      />
                    }
                    cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey={totalDataKey}
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="var(--accent)"
                    fillOpacity={0.12}
                    dot={metric === "profit" ? <NoteDot /> : false}
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
      {metric === "profit" &&
        data.some((p) => p.consolidated === false) && (
          <p className="mt-2 text-xs text-muted-foreground">
            Dias recentes = lucro provisório (reembolsos ainda podem entrar).
          </p>
        )}
    </div>
  );
}
