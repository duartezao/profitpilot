"use client";

import { useCallback, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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
import {
  formatMonthAxisLabel,
  monthAxisTickLabel,
  monthStartTicksFromDateKeys,
  resolveChartAxisGranularity,
  type ChartAxisGranularity,
} from "@/lib/period";

/** Altura do gráfico — mais área vertical para ler tendências. */
const CHART_FRAME_CLASS = "h-72 w-full min-w-0 sm:h-80 lg:h-96";
const CHART_EMPTY_CLASS =
  "mt-4 flex h-72 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground sm:h-80 lg:h-96";

/** True quando o gráfico de um só dia tem detalhe (lojas / nota) a mostrar. */
export function profitChartSingleDayHasContent(
  data: ProfitChartPoint[],
): boolean {
  if (data.length !== 1) return false;
  const p = data[0];
  return (
    (p.byStore?.length ?? 0) > 1 || Boolean(p.hasNote && p.notePreview)
  );
}

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

function collectKeyValues(
  chartData: Array<ProfitChartPoint & Record<string, unknown>>,
  keys: string[],
): number[] {
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




function chartMetricValue(
  sliceVal: number | undefined,
  rowVal: unknown,
): number | null {
  if (sliceVal !== undefined) return sliceVal;
  if (rowVal === null || rowVal === undefined) return null;
  return typeof rowVal === "number" ? rowVal : 0;
}




/** Placeholder com a mesma altura do gráfico (evita salto de layout). */
export function ProfitChartSkeleton({
  title = "Faturação / lucro",
}: {
  title?: string;
}) {
  return (
    <div className="min-w-0 animate-pulse" aria-hidden>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="h-7 w-40 rounded-md bg-muted" />
        <div className="flex gap-4">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-3 w-12 rounded bg-muted" />
        </div>
      </div>
      <span className="sr-only">{title}</span>
      <div className={cn(CHART_FRAME_CLASS, "animate-pulse rounded-lg bg-muted/70")} />
    </div>
  );
}

/** Um dia: sem cartões de faturação/lucro (já nos KPIs). Só contexto útil. */
function SingleDayView({ point }: { point: ProfitChartPoint }) {
  const stores = (point.byStore ?? []).filter(
    (s) => (s.revenue ?? 0) !== 0 || (s.profit ?? 0) !== 0,
  );
  const showStores = stores.length > 1;
  const showNote = Boolean(point.hasNote && point.notePreview);

  return (
    <div className="rounded-lg border border-border px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{point.dateLabel}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Um só dia — totais nos KPIs; detalhe na repartição de custos.
          </p>
        </div>
        {point.consolidated === false && (
          <span className="text-xs text-muted-foreground">
            Dentro da janela de reembolsos
          </span>
        )}
        {point.consolidated === true && (
          <span className="text-xs text-muted-foreground">Consolidado</span>
        )}
      </div>

      {showStores && (
        <ul className="mt-4 space-y-2.5 border-t border-border pt-4">
          <li className="flex justify-end gap-3 text-[11px] text-muted-foreground">
            <span className="w-16 text-right sm:w-20">Faturação</span>
            <span className="w-16 text-right sm:w-20">Lucro</span>
          </li>
          {stores.map((s: ProfitChartStoreSlice) => (
            <li
              key={s.storeId}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 truncate text-muted-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="truncate">{s.name}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                <Sensitive className="w-16 text-right text-muted-foreground sm:w-20">
                  {s.revenueFmt}
                </Sensitive>
                <Sensitive
                  className={cn(
                    "w-16 text-right font-medium sm:w-20",
                    s.profit < 0 ? "text-negative" : "text-foreground",
                  )}
                >
                  {s.profitFmt}
                </Sensitive>
              </span>
            </li>
          ))}
        </ul>
      )}

      {showNote && (
        <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
          {point.didScale && (
            <span className="mr-1 font-medium text-accent">Scale ·</span>
          )}
          {point.notePreview}
        </p>
      )}
    </div>
  );
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
  const profit = point.profit;
  const revenue = point.revenue;
  if (profit == null && revenue == null) return null;
  const profitFmt =
    point.profitFmt ?? (profit != null ? compactBarLabel(profit) : "—");
  const revenueFmt =
    point.revenueFmt ?? (revenue != null ? compactBarLabel(revenue) : "—");

  return (
    <div className="max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <p className="text-xs text-muted-foreground">{point.dateLabel}</p>
      <div className="mt-1.5 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Faturação</p>
          <p className="font-semibold tabular-nums text-foreground">{revenueFmt}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Lucro</p>
          <p
            className={cn(
              "font-semibold tabular-nums",
              profit != null && profit < 0 ? "text-negative" : "text-foreground",
            )}
          >
            {profitFmt}
          </p>
        </div>
      </div>
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

export function ProfitChart({
  data,
  series,
  title = "Faturação / lucro",
}: {
  data: ProfitChartPoint[];
  series?: ProfitChartSeries[];
  title?: string;
}) {
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

  /** Dados com lucro e faturação sempre disponíveis. */
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

          row[s.key] = profitVal;
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
  }, [seriesSource, series]);

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
    ? { top: 10, right: 12, left: 2, bottom: 6 }
    : { top: 12, right: 12, left: 2, bottom: 4 };

  const yDomain = useMemo((): [number, number] | undefined => {
    return computeChartYDomain(
      collectKeyValues(chartData, ["revenue", "profit"]),
      { anchorZero: true },
    );
  }, [chartData]);

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

  const legend = (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm bg-accent/80" aria-hidden />
        Faturação
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-0 w-3.5 border-t-2 border-dashed border-foreground/70"
          aria-hidden
        />
        Lucro
      </span>
    </div>
  );

  const singleDay = chartData.length === 1;
  const singlePoint = singleDay ? chartData[0] : null;
  const singleDayHasDetail =
    singlePoint != null &&
    ((singlePoint.byStore?.length ?? 0) > 1 ||
      Boolean(singlePoint.hasNote && singlePoint.notePreview));

  if (chartData.length === 0) {
    return (
      <div className="min-w-0 overflow-hidden" data-sensitive-chart>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="min-w-0 text-lg font-semibold">{title}</h2>
          {legend}
        </div>
        <div className={CHART_EMPTY_CLASS}>
          Sem dados no período selecionado.
        </div>
      </div>
    );
  }

  /** Um dia sem detalhe extra: KPIs + repartição bastam — não ocupar espaço. */
  if (singleDay && singlePoint && !singleDayHasDetail) {
    return null;
  }

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="min-w-0 text-lg font-semibold">
        {singleDay ? "Detalhe do dia" : title}
      </h2>
      {!singleDay && legend}
    </div>
  );

  return (
    <div className="min-w-0 overflow-hidden" data-sensitive-chart>
      {header}
      {singleDay && singlePoint ? (
        <SingleDayView point={singlePoint} />
      ) : (
        <>
          <div className={CHART_FRAME_CLASS}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={chartMargin}>
                <defs>
                  <linearGradient id="revenue-area-total" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--accent)"
                      stopOpacity={longRangeChart ? 0.28 : 0.36}
                    />
                    <stop
                      offset="55%"
                      stopColor="var(--accent)"
                      stopOpacity={longRangeChart ? 0.08 : 0.12}
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
                {zeroReference}
                <Tooltip
                  content={<ProfitTooltip />}
                  cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Faturação"
                  stroke="var(--accent)"
                  strokeWidth={longRangeChart ? 1.5 : 1.75}
                  fill="url(#revenue-area-total)"
                  baseValue={0}
                  isAnimationActive={false}
                  connectNulls={false}
                  dot={false}
                  activeDot={{
                    r: 3.5,
                    fill: "var(--accent)",
                    stroke: "var(--surface)",
                    strokeWidth: 2,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name="Lucro"
                  stroke="var(--foreground)"
                  strokeOpacity={0.85}
                  strokeWidth={longRangeChart ? 1.75 : 2}
                  strokeDasharray="5 4"
                  dot={<NoteDot />}
                  isAnimationActive={false}
                  connectNulls={false}
                  activeDot={{
                    r: 4,
                    fill: "var(--foreground)",
                    stroke: "var(--surface)",
                    strokeWidth: 2,
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 sm:hidden">{legend}</div>
        </>
      )}
    </div>
  );
}
