import type {
  ProfitChartPoint,
  ProfitChartSeries,
  ProfitChartStoreSlice,
} from "@/lib/metrics";
import { formatMonthAxisLabel } from "@/lib/period";

function compactBarLabel(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${Math.round(abs)}`;
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

/** Agrega pontos diários em totais mensais (soma). */
export function aggregateProfitChartByMonth(
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

  const rows = allMonthKeys.map((monthKey) => {
    const bucket = buckets.get(monthKey)!;
    const monthLabel = formatMonthAxisLabel(bucket.anchorKey);
    const year = bucket.anchorKey.slice(0, 4);
    /** Sem dias numéricos (ex. pré-importação) → null, não 0 enganador. */
    const profit = bucket.profitDays > 0 ? bucket.profit : null;
    const revenue = bucket.revenueDays > 0 ? bucket.revenue : null;

    const byStore: ProfitChartStoreSlice[] =
      profit == null && revenue == null
        ? []
        : series?.length
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
                  s.revenueDays > 0
                    ? compactBarLabel(s.revenue)
                    : compactBarLabel(0),
              }))
              .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit));

    const row: ProfitChartPoint & Record<string, unknown> = {
      dateKey: bucket.anchorKey,
      label: monthLabel,
      dateLabel: `${monthLabel} ${year}`,
      profit,
      profitFmt: profit != null ? compactBarLabel(profit) : "—",
      revenue,
      revenueFmt: revenue != null ? compactBarLabel(revenue) : "—",
      byStore,
    };

    if (series) {
      for (const s of series) {
        const profitKey = s.key;
        const revKey = s.revenueKey || `r_${s.storeId}`;
        const pAcc = bucket.dynamic.get(profitKey);
        const rAcc = bucket.dynamic.get(revKey);
        row[profitKey] = pAcc && pAcc.days > 0 ? pAcc.sum : null;
        row[revKey] = rAcc && rAcc.days > 0 ? rAcc.sum : null;
      }
    }

    return row as ProfitChartPoint;
  });

  /** Corta meses iniciais sem dados (null) — o eixo começa onde há actividade. */
  const firstActive = rows.findIndex(
    (r) =>
      (typeof r.profit === "number" && Number.isFinite(r.profit)) ||
      (typeof r.revenue === "number" && Number.isFinite(r.revenue)),
  );
  if (firstActive <= 0) return rows;
  return rows.slice(firstActive);
}
