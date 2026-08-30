"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  formatMonthAxisLabel,
  monthAxisTickLabel,
  monthStartTicksFromDateKeys,
  resolveChartAxisGranularity,
  type ChartAxisGranularity,
} from "@/lib/period";

type MultiStoreView = "stores" | "total";
type ChartMetric = "profit" | "revenue";

/** Altura do gráfico — mais área vertical para ler tendências. */
const CHART_FRAME_CLASS = "h-72 w-full min-w-0 sm:h-80 lg:h-96";
const CHART_EMPTY_CLASS =
  "mt-4 flex h-72 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground sm:h-80 lg:h-96";
const CHART_SINGLE_DAY_CLASS =
  "flex min-h-72 w-full min-w-0 flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border border-dashed border-border px-3 py-6 sm:min-h-80 sm:px-4 lg:min-h-96";

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

/** Domínio Y — lucro ancora sempre em 0; faturação pode ampliar quando longe de zero. */
function computeChartYDomain(
  values: number[],
  opts?: { anchorZero?: boolean },
): [number, number] | undefined {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return undefined;

  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.12, 10);
    min -= pad;
    max += pad;
  } else {
    const span = max - min;
    const pad = Math.max(span * 0.1, 1);
    min -= pad;
    max += pad;
  }

  if (opts?.anchorZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  } else if (min < 0 && max > 0) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  } else if (min >= 0) {
    const span = max - min;
    if (min <= span * 2) min = Math.min(min, 0);
  } else if (max <= 0) {
    const span = max - min;
    if (Math.abs(max) <= span * 2) max = Math.max(max, 0);
  }

  return [min, max];
}

function monthKeysInRange(startDateKey: string, endDateKey: string): string[] {
  const sy = Number(startDateKey.slice(0, 4));
  const sm = Number(startDateKey.slice(5, 7));
  const ey = Number(endDateKey.slice(0, 4));
  const em = Number(endDateKey.slice(5, 7));
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function aggregateProfitChartByMonth(
  points: ProfitChartPoint[],
  series?: ProfitChartSeries[],
): ProfitChartPoint[] {
  if (points.length === 0) return [];

  type StoreAcc = {
    storeId: string;
    name: string;
    color: string;
    profit: number;
    profitDays: number;
    revenue: number;
    revenueDays: number;
  };

  type MonthAcc = {
    monthKey: string;
    anchorKey: string;
    profit: number;
    profitDays: number;
    revenue: number;
    revenueDays: number;
    stores: Map<string, StoreAcc>;
    dynamic: Map<string, { sum: number; days: number }>;
  };

  const sorted = [...points].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const allMonthKeys = monthKeysInRange(
    sorted[0]!.dateKey,
    sorted[sorted.length - 1]!.dateKey,
  );

  const buckets = new Map<string, MonthAcc>();
  for (const monthKey of allMonthKeys) {
    buckets.set(monthKey, {
      monthKey,
      anchorKey: `${monthKey}-01`,
      profit: 0,
      profitDays: 0,
      revenue: 0,
      revenueDays: 0,
      stores: new Map(),
      dynamic: new Map(),
    });
  }

  for (const p of points) {
    const monthKey = p.dateKey.slice(0, 7);
    const bucket = buckets.get(monthKey);
    if (!bucket) continue;

    if (typeof p.profit === "number" && Number.isFinite(p.profit)) {
      bucket.profit += p.profit;
      bucket.profitDays += 1;
    }
    if (typeof p.revenue === "number" && Number.isFinite(p.revenue)) {
      bucket.revenue += p.revenue;
      bucket.revenueDays += 1;
    }

    for (const slice of p.byStore ?? []) {
      let st = bucket.stores.get(slice.storeId);
      if (!st) {
        st = {
          storeId: slice.storeId,
          name: slice.name,
          color: slice.color,
          profit: 0,
          profitDays: 0,
          revenue: 0,
          revenueDays: 0,
        };
        bucket.stores.set(slice.storeId, st);
      }
      st.profit += slice.profit;
      st.profitDays += 1;
      st.revenue += slice.revenue ?? 0;
      st.revenueDays += 1;
    }

    if (series) {
      const ext = p as ProfitChartPoint & Record<string, unknown>;
      for (const s of series) {
        for (const key of [s.key, s.revenueKey || `r_${s.storeId}`]) {
          const raw = ext[key];
          if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
          const acc = bucket.dynamic.get(key) ?? { sum: 0, days: 0 };
          acc.sum += raw;
          acc.days += 1;
          bucket.dynamic.set(key, acc);
        }
      }
    }
  }

  return allMonthKeys.map((monthKey) => {
    const bucket = buckets.get(monthKey)!;
    const monthLabel = formatMonthAxisLabel(bucket.anchorKey);
    const year = bucket.anchorKey.slice(0, 4);
    const profit = bucket.profitDays > 0 ? bucket.profit : 0;
    const revenue = bucket.revenueDays > 0 ? bucket.revenue : 0;

    const byStore: ProfitChartStoreSlice[] = series?.length
      ? series.map((s) => {
          const st = bucket.stores.get(s.storeId);
          const storeProfit = st && st.profitDays > 0 ? st.profit : 0;
          const storeRevenue = st && st.revenueDays > 0 ? st.revenue : 0;
          return {
            storeId: s.storeId,
            name: s.name,
            color: s.color,
            profit: storeProfit,
            profitFmt: compactBarLabel(storeProfit),
            revenue: storeRevenue,
            revenueFmt: compactBarLabel(storeRevenue),
          };
        })
      : [...bucket.stores.values()]
          .filter((s) => s.profitDays > 0)
          .map((s) => ({
            storeId: s.storeId,
            name: s.name,
            color: s.color,
            profit: s.profit,
            profitFmt: compactBarLabel(s.profit),
            revenue: s.revenueDays > 0 ? s.revenue : 0,
            revenueFmt:
              s.revenueDays > 0 ? compactBarLabel(s.revenue) : compactBarLabel(0),
          }))
          .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit));

    const row: ProfitChartPoint & Record<string, unknown> = {
      dateKey: bucket.anchorKey,
      label: monthLabel,
      dateLabel: `${monthLabel} ${year}`,
      profit,
      profitFmt: compactBarLabel(profit),
      revenue,
      revenueFmt: compactBarLabel(revenue),
      byStore,
    };

    if (series) {
      for (const s of series) {
        const profitKey = s.key;
        const revKey = s.revenueKey || `r_${s.storeId}`;
        const pAcc = bucket.dynamic.get(profitKey);
        const rAcc = bucket.dynamic.get(revKey);
        row[profitKey] = pAcc && pAcc.days > 0 ? pAcc.sum : 0;
        row[revKey] = rAcc && rAcc.days > 0 ? rAcc.sum : 0;
      }
    }

    return row as ProfitChartPoint;
  });
}

function collectChartMetricValues(
  chartData: Array<ProfitChartPoint & Record<string, unknown>>,
  metric: ChartMetric,
  series: ProfitChartSeries[] | undefined,
  showPerStore: boolean,
): number[] {
  const keys: string[] = [];
  if (showPerStore && series?.length) {
    for (const s of series) {
      keys.push(metric === "revenue" ? s.revenueKey || `r_${s.storeId}` : s.key);
    }
  } else {
    keys.push(metric === "revenue" ? "revenue" : "profit");
  }

  const out: number[] = [];
  for (const row of chartData) {
    for (const key of keys) {
      const v = row[key];
      if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    }
  }
  return out;
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
): { value: number | null; fmt: string } {
  if (metric === "revenue") {
    const v = point.revenue;
    return {
      value: v,
      fmt:
        point.revenueFmt ??
        (v != null ? compactBarLabel(v) : "—"),
    };
  }
  return {
    value: point.profit,
    fmt: point.profitFmt ?? (point.profit != null ? compactBarLabel(point.profit) : "—"),
  };
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

function chartMetricValue(
  sliceVal: number | undefined,
  rowVal: unknown,
): number | null {
  if (sliceVal !== undefined) return sliceVal;
  if (rowVal === null || rowVal === undefined) return null;
  return typeof rowVal === "number" ? rowVal : 0;
}

function areaGradientId(storeId: string): string {
  return `profit-area-${storeId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
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
      <div className={cn(CHART_FRAME_CLASS, "animate-pulse rounded-lg bg-muted/70")} />
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
  const positive = (value ?? 0) >= 0;
  const slices = point.byStore ?? [];

  return (
    <div className={CHART_SINGLE_DAY_CLASS}>
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
  if (value == null) return null;
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

function seriesLayerOrder(
  series: ProfitChartSeries[],
  chartData: Array<ProfitChartPoint & Record<string, unknown>>,
  dataKey: (s: ProfitChartSeries) => string,
): ProfitChartSeries[] {
  const avgAbs = (s: ProfitChartSeries) => {
    const key = dataKey(s);
    const total = chartData.reduce(
      (sum, p) => sum + Math.abs(Number(p[key] ?? 0)),
      0,
    );
    return total / Math.max(chartData.length, 1);
  };
  return [...series].sort((a, b) => avgAbs(b) - avgAbs(a));
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

  const axisGranularity: ChartAxisGranularity = useMemo(
    () => resolveChartAxisGranularity(data.length),
    [data.length],
  );

  const seriesSource = useMemo(() => {
    if (axisGranularity === "month") {
      return aggregateProfitChartByMonth(data, series);
    }
    return data;
  }, [data, series, axisGranularity]);

  /** Dados prontos para o Recharts: as chaves s_* levam lucro ou faturação conforme a métrica. */
  const chartData = useMemo(() => {
    return seriesSource.map((p) => {
      const row = { ...p } as ProfitChartPoint & Record<string, unknown>;
      const slices = p.byStore ?? [];

      let totalRevenue: number | null =
        typeof p.revenue === "number"
          ? p.revenue
          : slices.length > 0
            ? slices.reduce((sum, b) => sum + (b.revenue ?? 0), 0)
            : null;

      if (series?.length) {
        let sumRev = 0;
        let hasSliceRev = false;
        for (const s of series) {
          const slice = slices.find((b) => b.storeId === s.storeId);
          const revKey = s.revenueKey || `r_${s.storeId}`;
          const profitFromPoint = row[s.key];
          const revFromPoint = row[revKey];

          const profitVal = chartMetricValue(slice?.profit, profitFromPoint);
          const revVal = chartMetricValue(slice?.revenue, revFromPoint);

          if (slice && typeof slice.revenue === "number") {
            hasSliceRev = true;
            sumRev += slice.revenue;
          }

          row[s.key] =
            metric === "revenue" ? revVal : profitVal;
          row[revKey] = revVal;
        }
        if (typeof p.revenue !== "number" && hasSliceRev) {
          totalRevenue = sumRev;
        }
      }

      row.revenue = totalRevenue;
      row.profit = typeof p.profit === "number" ? p.profit : null;
      return row as ProfitChartPoint & Record<string, number | string | null>;
    });
  }, [seriesSource, series, metric]);

  const tickInterval = useMemo(() => {
    if (chartData.length <= 10) return 0;
    if (chartData.length <= 21) return 1;
    if (chartData.length <= 45) return 3;
    return Math.floor(chartData.length / 8);
  }, [chartData.length]);

  const axisGranularityResolved: ChartAxisGranularity = useMemo(
    () =>
      chartData.length > 0 && chartData.length < data.length
        ? "month"
        : resolveChartAxisGranularity(chartData.length),
    [chartData.length, data.length],
  );

  const monthTicks = useMemo(() => {
    if (axisGranularityResolved !== "month") return undefined;
    return monthStartTicksFromDateKeys(chartData.map((p) => p.dateKey));
  }, [axisGranularityResolved, chartData]);

  const formatXAxisTick = useCallback(
    (value: string) => {
      if (axisGranularityResolved !== "month") {
        const point = chartData.find((p) => p.dateKey === value);
        return point?.label ?? value;
      }
      const idx = monthTicks?.indexOf(value) ?? -1;
      const prev = idx > 0 ? monthTicks![idx - 1] : undefined;
      return monthAxisTickLabel(value, prev);
    },
    [axisGranularityResolved, chartData, monthTicks],
  );

  const longRangeChart = axisGranularityResolved === "month";
  const chartMargin = longRangeChart
    ? { top: 10, right: 10, left: 2, bottom: 6 }
    : { top: 12, right: 8, left: 2, bottom: 4 };
  const areaStrokeWidth = longRangeChart ? 1.25 : 1.5;

  const yDomain = useMemo((): [number, number] | undefined => {
    return computeChartYDomain(
      collectChartMetricValues(chartData, metric, series, showPerStore),
      { anchorZero: metric === "profit" },
    );
  }, [chartData, metric, series, showPerStore]);

  const zeroReference = (
    <ReferenceLine
      y={0}
      stroke="var(--muted-foreground)"
      strokeOpacity={0.7}
      strokeWidth={1}
      ifOverflow="extendDomain"
      label={{
        value: "0",
        position: "left",
        fill: "var(--muted-foreground)",
        fontSize: 10,
      }}
    />
  );

  if (chartData.length === 0) {
    return (
      <div className={CHART_EMPTY_CLASS}>
        Sem dados no período selecionado.
      </div>
    );
  }

  const singleDay = chartData.length === 1;
  const chartRemountKey = `${metric}-${multiView}`;
  const lineDataKey = (s: ProfitChartSeries) => s.key;
  const layeredSeries =
    showPerStore && series
      ? seriesLayerOrder(series, chartData, lineDataKey)
      : series;

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
            point={chartData[0]}
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
          <div className={CHART_FRAME_CLASS}>
            <ResponsiveContainer width="100%" height="100%">
              {showPerStore && layeredSeries ? (
                <AreaChart
                  key={chartRemountKey}
                  data={chartData}
                  margin={chartMargin}
                >
                  <defs>
                    {layeredSeries.map((s) => (
                      <linearGradient
                        key={s.storeId}
                        id={areaGradientId(s.storeId)}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={s.color}
                          stopOpacity={longRangeChart ? 0.22 : 0.32}
                        />
                        <stop
                          offset="55%"
                          stopColor={s.color}
                          stopOpacity={longRangeChart ? 0.07 : 0.1}
                        />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 7"
                    vertical={false}
                    strokeOpacity={0.45}
                  />
                  <XAxis
                    dataKey="dateKey"
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)", strokeOpacity: 0.9 }}
                    tick={{
                      fill: "var(--muted-foreground)",
                      fontSize: longRangeChart ? 10 : 11,
                    }}
                    ticks={monthTicks}
                    tickFormatter={formatXAxisTick}
                    interval={longRangeChart ? 0 : tickInterval}
                    minTickGap={longRangeChart ? 8 : 24}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)", strokeOpacity: 0.75 }}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    width={52}
                    tickFormatter={compactAxisValue}
                    domain={yDomain}
                    allowDataOverflow
                    tickCount={6}
                  />
                  {metric === "profit" && zeroReference}
                  <Tooltip
                    content={
                      <ProfitTooltip
                        multiStore={multiStore}
                        metric={metric}
                        onStoreClick={onStoreClick}
                      />
                    }
                    cursor={{
                      stroke: "var(--muted-foreground)",
                      strokeWidth: 1,
                      strokeOpacity: 0.25,
                    }}
                  />
                  {layeredSeries.map((s) => (
                    <Area
                      key={`${s.storeId}-${metric}`}
                      type="monotone"
                      dataKey={lineDataKey(s)}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={areaStrokeWidth}
                      fill={`url(#${areaGradientId(s.storeId)})`}
                      baseValue={0}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls={false}
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
                </AreaChart>
              ) : (
                <AreaChart
                  key={chartRemountKey}
                  data={chartData}
                  margin={chartMargin}
                >
                  <defs>
                    <linearGradient id="profit-area-total" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="var(--accent)"
                        stopOpacity={longRangeChart ? 0.2 : 0.28}
                      />
                      <stop
                        offset="55%"
                        stopColor="var(--accent)"
                        stopOpacity={longRangeChart ? 0.06 : 0.08}
                      />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 7"
                    vertical={false}
                    strokeOpacity={0.45}
                  />
                  <XAxis
                    dataKey="dateKey"
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)", strokeOpacity: 0.9 }}
                    tick={{
                      fill: "var(--muted-foreground)",
                      fontSize: longRangeChart ? 10 : 11,
                    }}
                    ticks={monthTicks}
                    tickFormatter={formatXAxisTick}
                    interval={longRangeChart ? 0 : tickInterval}
                    minTickGap={longRangeChart ? 8 : 24}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)", strokeOpacity: 0.75 }}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    width={52}
                    tickFormatter={compactAxisValue}
                    domain={yDomain}
                    allowDataOverflow
                    tickCount={6}
                  />
                  {metric === "profit" && zeroReference}
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
                    strokeWidth={longRangeChart ? 2 : areaStrokeWidth}
                    fill="url(#profit-area-total)"
                    baseValue={0}
                    isAnimationActive={false}
                    connectNulls={false}
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
        chartData.some((p) => p.consolidated === false) && (
          <p className="mt-2 text-xs text-muted-foreground">
            Dias recentes = lucro provisório (reembolsos ainda podem entrar).
          </p>
        )}
    </div>
  );
}
