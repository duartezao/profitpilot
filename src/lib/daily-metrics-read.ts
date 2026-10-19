import "server-only";
import mongoose from "mongoose";
import { DailyMetric } from "@/models/DailyMetric";

/** Campos financeiros de um snapshot diário (já na moeda base). */
export type DailyMetricSnap = {
  dateKey: string;
  storeId: string;
  revenue: number;
  orders: number;
  cogs: number;
  shipping: number;
  fees: number;
  refunds: number;
  chargebacks: number;
  adSpend: number;
  operatingExpenses: number;
  netProfit: number;
  sessions: number | null;
  atcPct: number | null;
  cvrPct: number | null;
};

export type DailyMetricDayAgg = {
  revenue: number;
  orders: number;
  cogs: number;
  shipping: number;
  fees: number;
  refunds: number;
  chargebacks: number;
  adSpend: number;
  operatingExpenses: number;
  netProfit: number;
  /** Quantas lojas tinham snapshot neste dia. */
  storeCount: number;
};

const emptyDayAgg = (): DailyMetricDayAgg => ({
  revenue: 0,
  orders: 0,
  cogs: 0,
  shipping: 0,
  fees: 0,
  refunds: 0,
  chargebacks: 0,
  adSpend: 0,
  operatingExpenses: 0,
  netProfit: 0,
  storeCount: 0,
});

/**
 * Carrega snapshots no intervalo civil [fromKey, toKey].
 * Mais barato que `$in` com centenas de chaves.
 */
export async function loadDailyMetricSnaps(
  storeOids: mongoose.Types.ObjectId[],
  fromKey: string,
  toKey: string,
): Promise<DailyMetricSnap[]> {
  if (!storeOids.length || !fromKey || !toKey || fromKey > toKey) return [];

  const rows = await DailyMetric.find({
    storeId: storeOids.length === 1 ? storeOids[0] : { $in: storeOids },
    dateKey: { $gte: fromKey, $lte: toKey },
  })
    .select(
      "dateKey storeId revenue orders cogs shippingCost feesTotal refunds chargebacks adSpend operatingExpenses netProfit sessions atcPct cvrPct",
    )
    .lean();

  return rows.map((r) => ({
    dateKey: r.dateKey,
    storeId: String(r.storeId),
    revenue: r.revenue ?? 0,
    orders: r.orders ?? 0,
    cogs: r.cogs ?? 0,
    shipping: r.shippingCost ?? 0,
    fees: r.feesTotal ?? 0,
    refunds: r.refunds ?? 0,
    chargebacks: r.chargebacks ?? 0,
    adSpend: r.adSpend ?? 0,
    operatingExpenses: r.operatingExpenses ?? 0,
    netProfit: r.netProfit ?? 0,
    sessions: r.sessions ?? null,
    atcPct: r.atcPct ?? null,
    cvrPct: r.cvrPct ?? null,
  }));
}

/** Agrega snapshots por dia (soma lojas). */
export function aggregateSnapsByDate(
  snaps: DailyMetricSnap[],
  allowedKeys?: Set<string>,
): Map<string, DailyMetricDayAgg> {
  const out = new Map<string, DailyMetricDayAgg>();
  for (const s of snaps) {
    if (allowedKeys && !allowedKeys.has(s.dateKey)) continue;
    const row = out.get(s.dateKey) ?? emptyDayAgg();
    row.revenue += s.revenue;
    row.orders += s.orders;
    row.cogs += s.cogs;
    row.shipping += s.shipping;
    row.fees += s.fees;
    row.refunds += s.refunds;
    row.chargebacks += s.chargebacks;
    row.adSpend += s.adSpend;
    row.operatingExpenses += s.operatingExpenses;
    row.netProfit += s.netProfit;
    row.storeCount += 1;
    out.set(s.dateKey, row);
  }
  return out;
}

/** Mapa `dateKey:storeId` → snapshot. */
export function snapsByStoreDay(
  snaps: DailyMetricSnap[],
): Map<string, DailyMetricSnap> {
  const out = new Map<string, DailyMetricSnap>();
  for (const s of snaps) {
    out.set(`${s.dateKey}:${s.storeId}`, s);
  }
  return out;
}

/** Dias históricos cobertos por snapshot em *todas* as lojas pedidas. */
export function fullyCoveredHistKeys(
  byDate: Map<string, DailyMetricDayAgg>,
  histKeys: string[],
  storeCount: number,
): { covered: string[]; missing: string[] } {
  const covered: string[] = [];
  const missing: string[] = [];
  for (const k of histKeys) {
    const row = byDate.get(k);
    if (row && row.storeCount >= storeCount) covered.push(k);
    else missing.push(k);
  }
  return { covered, missing };
}

export function sumDayAggs(
  byDate: Map<string, DailyMetricDayAgg>,
  keys: string[],
): Omit<DailyMetricDayAgg, "storeCount"> {
  const out = emptyDayAgg();
  for (const k of keys) {
    const row = byDate.get(k);
    if (!row) continue;
    out.revenue += row.revenue;
    out.orders += row.orders;
    out.cogs += row.cogs;
    out.shipping += row.shipping;
    out.fees += row.fees;
    out.refunds += row.refunds;
    out.chargebacks += row.chargebacks;
    out.adSpend += row.adSpend;
    out.operatingExpenses += row.operatingExpenses;
    out.netProfit += row.netProfit;
  }
  const { storeCount: _, ...rest } = out;
  return rest;
}
