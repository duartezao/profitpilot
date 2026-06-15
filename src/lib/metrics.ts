import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { formatCurrency, formatCurrencyCompact, formatPercent } from "@/lib/utils";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { Order } from "@/models/Order";
import { Payout } from "@/models/Payout";
import { netRevenueSumExpr, orderNetRevenue } from "@/lib/order-revenue";
import { sumAdSpendForPeriod, buildStoreAdSpendSummaries } from "@/lib/ad-spend";
import { countSoldVariantsMissingCost, countMissingCogsByDay } from "@/lib/cogs";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import {
  resolvePeriodForStore,
  orderDateMatchInTimezone,
  normalizeStoreTimezone,
  dayKeysBetweenInTimezone,
  importDateKey,
} from "@/lib/store-timezone";
import {
  resolvePeriod,
  orderDateMatch,
  periodDayCount,
  periodIsSingleDay,
  formatDateInput,
  parseDateInput,
  addDays,
  startOfDay,
  clampSliceToImportFloor,
  earliestImportFloor,
  resolveImportFloor,
  type PeriodInput,
  type ResolvedPeriod,
} from "@/lib/period";
import {
  fetchStoreDailyNotesForPeriod,
  type StoreDailyNoteView,
} from "@/lib/daily-notes";
import {
  aggregateSessionFunnelFromDb,
  loadDailySessionCountsForSlice,
  type SessionFunnelMetrics,
} from "@/lib/session-metrics";
import { getStoreDisplayUrl } from "@/lib/store-display";
import {
  calcNetProfit,
  contributionMarginPct,
  berRoas,
} from "@/lib/profit";

export type KpiIcon = "euro" | "percent" | "target" | "trending";

export type SummaryKpi = {
  label: string;
  value: string;
  /** Valor exato (tooltip) quando `value` está em notação compacta. */
  title?: string;
  delta?: number;
  /** Texto após o delta, ex. "vs 1–30 Abr 2025" */
  deltaLabel?: string;
  /** true = pontos percentuais (pp), false = % relativa */
  deltaIsPoints?: boolean;
  trend?: number[];
  icon?: KpiIcon;
};

export type SummaryStore = {
  name: string;
  revenue: string;
  profit: string;
  margin: string;
  roas: string;
  positive: boolean;
  trend: number[];
};

export type TopProduct = {
  title: string;
  units: number;
  revenue: string;
  profit: string;
  margin: string;
  positive: boolean;
  marginPositive: boolean;
};

export type WaterfallStep = {
  key: string;
  label: string;
  value: number;
  display: string;
  type: "start" | "negative" | "total";
};

export type StorePayoutPreview = {
  amount: number;
  amountFmt: string;
  nextDate: string | null;
  nextDateLabel: string | null;
};

export type StoreDashboardData = {
  waterfall: WaterfallStep[];
  payout: StorePayoutPreview;
  periodLabel: string;
  prevPeriodLabel: string;
  periodIsSingleDay: boolean;
  dailyNotes: StoreDailyNoteView[];
  funnelKpis: SummaryKpi[];
  funnelError?: string;
  sessionCountryLabel: string;
  lastSessionMetricsError?: string | null;
};

export type ProfitChartPoint = {
  dateKey: string;
  label: string;
  dateLabel: string;
  profit: number;
  profitFmt: string;
};

/** Linha da tabela diária (métricas por dia — página /metricas). */
export type StoreDailyMetricRow = {
  dateKey: string;
  dateLabel: string;
  revenue: string;
  cogs: string;
  refunds: string;
  adSpend: string;
  profit: string;
  profitPositive: boolean;
  /** Tooltip quando COGS em falta distorce o lucro do dia. */
  profitTitle?: string;
  sessions: number | null;
  atcPct: string;
  checkoutPct: string;
  cvrPct: string;
  /** Há nota diária (texto, scale ou humor) neste dia. */
  hasNote?: boolean;
  notePreview?: string;
};

export type DashboardSummary = {
  kpis: SummaryKpi[];
  stores: SummaryStore[];
  /** Nome da loja quando a vista está filtrada por uma só loja. */
  scopeName: string | null;
  /** Domínio da loja (ex. marie-bruxelles.com) para o título. */
  scopeDomain: string | null;
  /** Top produtos (só na vista de uma loja). */
  topProducts: TopProduct[];
  /** Dados extra da dashboard por loja (waterfall, payout). */
  storeDashboard: StoreDashboardData | null;
  /** Notas diárias (vista por loja). */
  dailyNotes: StoreDailyNoteView[];
  /** Produtos vendidos sem COGS — lucro pode estar incompleto. */
  cogsIncomplete: boolean;
  missingCogsCount: number;
  /** Dias de ad spend em falta (desde importação até ontem). */
  missingAdSpendDays: number;
  /** Série diária de lucro (vista consolidada). */
  profitChart: ProfitChartPoint[];
  /** Métricas dia a dia (vista por loja). */
  dailyMetrics: StoreDailyMetricRow[];
  /** Métricas extra (custos, funil, encomendas…) — painel «Ver mais». */
  extendedKpis: SummaryKpi[];
  /** ISO timestamp de quando os dados foram calculados. */
  generatedAt: string;
};

type StoreAgg = {
  revenue: number;
  cogs: number;
  shipping: number;
  fees: number;
  refunds: number;
  orders: number;
};

function calcProfit(
  a: Pick<StoreAgg, "revenue" | "cogs" | "shipping" | "fees">,
  adSpend = 0,
) {
  return calcNetProfit(a, adSpend);
}

function deltaPct(current: number, prev: number) {
  if (prev === 0) return current > 0 ? 100 : 0;
  return ((current - prev) / Math.abs(prev)) * 100;
}

function fmtRoasRatio(v: number | null): string {
  return v != null ? v.toFixed(2).replace(".", ",") : "—";
}

function buildExtendedStoreKpis(
  cur: StoreAgg,
  prev: StoreAgg,
  curAdSpend: number,
  prevAdSpend: number,
  funnelCur: SessionFunnelMetrics,
  funnelPrev: SessionFunnelMetrics | null,
  deltaSuffix: string,
  money: (v: number) => string,
  fmtMoney: (v: number) => string,
): SummaryKpi[] {
  const curCm = contributionMarginPct(cur);
  const prevCm = contributionMarginPct(prev);
  const curAov = cur.orders > 0 ? cur.revenue / cur.orders : null;
  const prevAov = prev.orders > 0 ? prev.revenue / prev.orders : null;
  const curMer = curAdSpend > 0 ? cur.revenue / curAdSpend : null;
  const prevMer = prevAdSpend > 0 ? prev.revenue / prevAdSpend : null;

  const costKpis: SummaryKpi[] = [
    {
      label: "Margem contrib. %",
      value: formatPercent(curCm),
      title:
        "Margem antes do ad spend (REV − COGS − envio − taxas) / REV",
      delta: curCm - prevCm,
      deltaLabel: deltaSuffix,
      deltaIsPoints: true,
      icon: "percent",
    },
    {
      label: "COGS",
      value: money(cur.cogs),
      title: fmtMoney(cur.cogs),
      delta: deltaPct(cur.cogs, prev.cogs),
      deltaLabel: deltaSuffix,
      icon: "euro",
    },
    {
      label: "Envio",
      value: money(cur.shipping),
      title: fmtMoney(cur.shipping),
      delta: deltaPct(cur.shipping, prev.shipping),
      deltaLabel: deltaSuffix,
      icon: "euro",
    },
    {
      label: "Taxas",
      value: money(cur.fees),
      title: fmtMoney(cur.fees),
      delta: deltaPct(cur.fees, prev.fees),
      deltaLabel: deltaSuffix,
      icon: "euro",
    },
    {
      label: "Ad Spend",
      value: money(curAdSpend),
      title: fmtMoney(curAdSpend),
      delta: deltaPct(curAdSpend, prevAdSpend),
      deltaLabel: deltaSuffix,
      icon: "euro",
    },
    {
      label: "Refunds",
      value: fmtMoney(cur.refunds),
      title: "Informativo — já reflectidos na REV líquida",
      delta: deltaPct(cur.refunds, prev.refunds),
      deltaLabel: deltaSuffix,
      icon: "euro",
    },
    {
      label: "Encomendas",
      value: cur.orders.toLocaleString("pt-PT"),
      delta: deltaPct(cur.orders, prev.orders),
      deltaLabel: deltaSuffix,
      icon: "trending",
    },
    {
      label: "AOV",
      value: curAov != null ? money(curAov) : "—",
      title:
        curAov != null
          ? `Valor médio por encomenda · ${fmtMoney(curAov)}`
          : undefined,
      delta:
        curAov != null && prevAov != null
          ? deltaPct(curAov, prevAov)
          : undefined,
      deltaLabel: curAov != null ? deltaSuffix : undefined,
      icon: "euro",
    },
    {
      label: "MER",
      value: fmtRoasRatio(curMer),
      title: "Marketing Efficiency Ratio = REV / ad spend",
      delta:
        curMer != null && prevMer != null
          ? deltaPct(curMer, prevMer)
          : undefined,
      deltaLabel: curMer != null ? deltaSuffix : undefined,
      icon: "target",
    },
  ];

  return [...costKpis, ...buildFunnelKpis(funnelCur, funnelPrev, deltaSuffix)];
}

function buildExtendedWorkspaceKpis(
  cur: StoreAgg,
  prev: StoreAgg,
  curAdSpend: number,
  prevAdSpend: number,
  deltaSuffix: string,
  money: (v: number) => string,
  fmtMoney: (v: number) => string,
): SummaryKpi[] {
  const curCm = contributionMarginPct(cur);
  const prevCm = contributionMarginPct(prev);
  const curBer = berRoas(cur);
  const prevBer = berRoas(prev);
  const curAov = cur.orders > 0 ? cur.revenue / cur.orders : null;
  const prevAov = prev.orders > 0 ? prev.revenue / prev.orders : null;

  return [
    {
      label: "Margem contrib. %",
      value: formatPercent(curCm),
      title: "Margem antes do ad spend",
      delta: curCm - prevCm,
      deltaLabel: deltaSuffix,
      deltaIsPoints: true,
      icon: "percent",
    },
    {
      label: "BER",
      value: fmtRoasRatio(curBer),
      title:
        curBer != null
          ? "Break-even ROAS — ROAS mínimo para não perder dinheiro"
          : "Sem margem de contribuição positiva",
      delta:
        curBer != null && prevBer != null
          ? deltaPct(curBer, prevBer)
          : undefined,
      deltaLabel: curBer != null ? deltaSuffix : undefined,
      icon: "target",
    },
    {
      label: "COGS",
      value: money(cur.cogs),
      title: fmtMoney(cur.cogs),
      delta: deltaPct(cur.cogs, prev.cogs),
      deltaLabel: deltaSuffix,
      icon: "euro",
    },
    {
      label: "Envio",
      value: money(cur.shipping),
      title: fmtMoney(cur.shipping),
      delta: deltaPct(cur.shipping, prev.shipping),
      deltaLabel: deltaSuffix,
      icon: "euro",
    },
    {
      label: "Taxas",
      value: money(cur.fees),
      title: fmtMoney(cur.fees),
      delta: deltaPct(cur.fees, prev.fees),
      deltaLabel: deltaSuffix,
      icon: "euro",
    },
    {
      label: "Refunds",
      value: fmtMoney(cur.refunds),
      title: "Informativo — já na REV líquida",
      delta: deltaPct(cur.refunds, prev.refunds),
      deltaLabel: deltaSuffix,
      icon: "euro",
    },
    {
      label: "Encomendas",
      value: cur.orders.toLocaleString("pt-PT"),
      delta: deltaPct(cur.orders, prev.orders),
      deltaLabel: deltaSuffix,
      icon: "trending",
    },
    {
      label: "AOV",
      value: curAov != null ? money(curAov) : "—",
      title: curAov != null ? fmtMoney(curAov) : undefined,
      delta:
        curAov != null && prevAov != null
          ? deltaPct(curAov, prevAov)
          : undefined,
      deltaLabel: curAov != null ? deltaSuffix : undefined,
      icon: "euro",
    },
    {
      label: "Ad Spend",
      value: money(curAdSpend),
      title: fmtMoney(curAdSpend),
      delta: deltaPct(curAdSpend, prevAdSpend),
      deltaLabel: deltaSuffix,
      icon: "euro",
    },
  ];
}

function buildFunnelKpis(
  cur: SessionFunnelMetrics,
  prev: SessionFunnelMetrics | null,
  deltaSuffix: string,
): SummaryKpi[] {
  const sessFmt = (n: number) =>
    n.toLocaleString("pt-PT", { maximumFractionDigits: 0 });
  const pctFmt = (p: number | null) =>
    p != null ? formatPercent(p) : "—";
  const pctDelta = (a: number | null, b: number | null) =>
    a != null && b != null ? a - b : undefined;

  return [
    {
      label: "Sessões",
      value: cur.error ? "—" : sessFmt(cur.sessions),
      title: cur.error,
      delta:
        !cur.error && prev && !prev.error
          ? deltaPct(cur.sessions, prev.sessions)
          : undefined,
      deltaLabel: !cur.error && prev && !prev.error ? deltaSuffix : undefined,
      icon: "trending",
    },
    {
      label: "ATC %",
      value: pctFmt(cur.atcPct),
      delta: pctDelta(cur.atcPct, prev?.atcPct ?? null),
      deltaLabel: cur.atcPct != null ? deltaSuffix : undefined,
      deltaIsPoints: true,
      icon: "percent",
    },
    {
      label: "Checkout %",
      value: pctFmt(cur.checkoutPct),
      delta: pctDelta(cur.checkoutPct, prev?.checkoutPct ?? null),
      deltaLabel: cur.checkoutPct != null ? deltaSuffix : undefined,
      deltaIsPoints: true,
      icon: "percent",
    },
    {
      label: "CVR %",
      value: pctFmt(cur.cvrPct),
      delta: pctDelta(cur.cvrPct, prev?.cvrPct ?? null),
      deltaLabel: cur.cvrPct != null ? deltaSuffix : undefined,
      deltaIsPoints: true,
      icon: "target",
    },
  ];
}

function normPayoutStatus(s?: string | null) {
  return (s ?? "").toLowerCase();
}

type PeriodSlice = Pick<ResolvedPeriod, "start" | "end" | "specificDates">;

function missingCogsNote(count: number): string {
  const n = count === 1 ? "produto" : "produtos";
  return `COGS em falta em ${count} ${n} neste período — lucro pode estar superestimado; confirma custos do fornecedor`;
}

function adSpendDateMatch(
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Record<string, unknown> {
  if (slice.specificDates?.length) {
    return { dateKey: { $in: slice.specificDates } };
  }
  if (storeTimeZone) {
    const keys = dayKeysBetweenInTimezone(
      slice.start,
      slice.end,
      storeTimeZone,
    );
    if (!keys.length) return { dateKey: { $in: [] } };
    return { dateKey: { $gte: keys[0], $lte: keys[keys.length - 1] } };
  }
  return {
    dateKey: {
      $gte: formatDateInput(slice.start),
      $lte: formatDateInput(slice.end),
    },
  };
}

async function aggregateDailyAdSpend(
  storeOids: mongoose.Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<Map<string, number>> {
  if (!storeOids.length) return new Map();

  const rows = await ManualAdSpend.aggregate<{ _id: string; total: number }>([
    {
      $match: {
        storeId: { $in: storeOids },
        ...adSpendDateMatch(slice, storeTimeZone),
      },
    },
    {
      $group: {
        _id: "$dateKey",
        total: {
          $sum: { $add: ["$amount", { $ifNull: ["$extraFee", 0] }] },
        },
      },
    },
  ]);

  return new Map(rows.map((r) => [r._id, r.total]));
}

async function aggregateDailyOrders(
  wsId: mongoose.Types.ObjectId,
  storeOids: mongoose.Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<
  Map<
    string,
    Pick<StoreAgg, "revenue" | "cogs" | "shipping" | "fees" | "refunds">
  >
> {
  const match: Record<string, unknown> = {
    workspaceId: wsId,
    ...(storeTimeZone
      ? orderDateMatchInTimezone(slice, storeTimeZone)
      : orderDateMatch(slice)),
  };
  if (storeOids.length === 1) {
    match.storeId = storeOids[0];
  } else if (storeOids.length > 1) {
    match.storeId = { $in: storeOids };
  }

  const rows = await Order.aggregate<{
    _id: string;
    revenue: number;
    cogs: number;
    shipping: number;
    fees: number;
    refunds: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: storeTimeZone
          ? {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$orderDate",
                timezone: normalizeStoreTimezone(storeTimeZone),
              },
            }
          : {
              $dateToString: { format: "%Y-%m-%d", date: "$orderDate" },
            },
        revenue: netRevenueSumExpr,
        cogs: { $sum: "$cogs" },
        shipping: { $sum: "$shipping" },
        fees: { $sum: "$fees" },
        refunds: { $sum: "$refunded" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return new Map(
    rows.map((r) => [
      r._id,
      {
        revenue: r.revenue,
        cogs: r.cogs,
        shipping: r.shipping,
        fees: r.fees,
        refunds: r.refunds,
      },
    ]),
  );
}

function dayKeysInSlice(slice: PeriodSlice, storeTimeZone?: string | null): string[] {
  if (slice.specificDates !== undefined) {
    return [...slice.specificDates].sort();
  }
  if (storeTimeZone) {
    return dayKeysBetweenInTimezone(
      slice.start,
      slice.end,
      storeTimeZone,
    );
  }
  const keys: string[] = [];
  let cur = startOfDay(slice.start);
  const end = startOfDay(slice.end);
  while (cur <= end) {
    keys.push(formatDateInput(cur));
    cur = addDays(cur, 1);
  }
  return keys;
}

async function buildDailyProfitSeries(
  wsId: mongoose.Types.ObjectId,
  storeOids: mongoose.Types.ObjectId[],
  slice: PeriodSlice,
  fmtMoney: (v: number) => string,
  storeTimeZone?: string | null,
): Promise<ProfitChartPoint[]> {
  const [orderByDay, adByDay] = await Promise.all([
    aggregateDailyOrders(wsId, storeOids, slice, storeTimeZone),
    aggregateDailyAdSpend(storeOids, slice, storeTimeZone),
  ]);

  return dayKeysInSlice(slice, storeTimeZone).map((dateKey) => {
    const o = orderByDay.get(dateKey) ?? {
      revenue: 0,
      cogs: 0,
      shipping: 0,
      fees: 0,
      refunds: 0,
    };
    const ad = adByDay.get(dateKey) ?? 0;
    const profit = calcProfit(o, ad);
    const d = parseDateInput(dateKey);
    const label = d
      ? d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })
      : dateKey;
    const dateLabel = d
      ? d.toLocaleDateString("pt-PT", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : dateKey;
    return { dateKey, label, dateLabel, profit, profitFmt: fmtMoney(profit) };
  });
}

function pctFmtFromCounts(num: number, den: number): string {
  if (den <= 0) return "—";
  return formatPercent((num / den) * 100);
}

async function buildStoreDailyMetrics(
  wsId: mongoose.Types.ObjectId,
  storeOid: mongoose.Types.ObjectId,
  slice: PeriodSlice,
  fmtMoney: (v: number) => string,
  analyticsSessionCountry: string | null | undefined,
  storeTimeZone?: string | null,
): Promise<StoreDailyMetricRow[]> {
  const [orderByDay, adByDay, sessionsByDay, missingCogsByDay] =
    await Promise.all([
      aggregateDailyOrders(wsId, [storeOid], slice, storeTimeZone),
      aggregateDailyAdSpend([storeOid], slice, storeTimeZone),
      loadDailySessionCountsForSlice(
        storeOid,
        analyticsSessionCountry,
        slice,
        storeTimeZone,
      ),
      countMissingCogsByDay([storeOid], slice, storeTimeZone),
    ]);

  return dayKeysInSlice(slice, storeTimeZone)
    .map((dateKey) => {
      const o = orderByDay.get(dateKey) ?? {
        revenue: 0,
        cogs: 0,
        shipping: 0,
        fees: 0,
        refunds: 0,
      };
      const ad = adByDay.get(dateKey) ?? 0;
      const profit = calcProfit(o, ad);
      const missingCogs = missingCogsByDay.get(dateKey) ?? 0;
      const d = parseDateInput(dateKey);
      const dateLabel = d
        ? d.toLocaleDateString("pt-PT", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : dateKey;
      const sess = sessionsByDay.get(dateKey);
      const sessions = sess?.sessions ?? null;
      return {
        dateKey,
        dateLabel,
        revenue: fmtMoney(o.revenue),
        cogs: fmtMoney(o.cogs),
        refunds: fmtMoney(o.refunds),
        adSpend: fmtMoney(ad),
        profit: fmtMoney(profit),
        profitPositive: profit >= 0,
        profitTitle:
          missingCogs > 0
            ? `${fmtMoney(profit)} · ${missingCogsNote(missingCogs)}`
            : `REV − COGS − envio − taxas − ad spend`,
        sessions,
        atcPct: sess ? pctFmtFromCounts(sess.cart, sess.sessions) : "—",
        checkoutPct: sess ? pctFmtFromCounts(sess.checkout, sess.sessions) : "—",
        cvrPct: sess ? pctFmtFromCounts(sess.completed, sess.sessions) : "—",
      };
    })
    .reverse();
}

async function buildStoreSparkline(
  wsId: mongoose.Types.ObjectId,
  storeOid: mongoose.Types.ObjectId,
  slice: PeriodSlice,
  storeTimeZone?: string | null,
  points = 7,
): Promise<number[]> {
  const series = await buildDailyProfitSeries(
    wsId,
    [storeOid],
    slice,
    () => "",
    storeTimeZone,
  );
  const tail = series.slice(-points);
  return tail.map((p) => p.profit);
}

async function sumMissingAdSpendDays(
  stores: Array<{
    _id: mongoose.Types.ObjectId;
    name: string;
    importStartDate?: Date | null;
    createdAt?: Date;
  }>,
  currency: string,
): Promise<number> {
  const summaries = await buildStoreAdSpendSummaries(stores, currency);
  return summaries.reduce((s, x) => s + x.missingCount, 0);
}

async function buildTopProductsByProfit(
  storeOid: mongoose.Types.ObjectId,
  slice: PeriodSlice,
  fmtMoney: (v: number) => string,
  limit = 5,
  storeTimeZone?: string | null,
): Promise<TopProduct[]> {
  const orders = await Order.find({
    storeId: storeOid,
    ...(storeTimeZone
      ? orderDateMatchInTimezone(slice, storeTimeZone)
      : orderDateMatch(slice)),
  })
    .select("lineItems shipping fees refunded totalPrice subtotal")
    .lean();

  const map = new Map<string, { units: number; revenue: number; profit: number }>();

  for (const order of orders) {
    const lines = order.lineItems ?? [];
    let lineRev = 0;
    for (const li of lines) {
      lineRev += (li.unitPrice ?? 0) * (li.quantity ?? 0);
    }
    const netRev = orderNetRevenue(order);
    const basis = lineRev > 0 ? lineRev : netRev;
    const overhead = (order.shipping ?? 0) + (order.fees ?? 0);

    for (const li of lines) {
      const rev = (li.unitPrice ?? 0) * (li.quantity ?? 0);
      const cost = (li.unitCost ?? 0) * (li.quantity ?? 0);
      const share = basis > 0 ? rev / basis : 0;
      const profit = rev - cost - overhead * share;
      const title = li.title || "(sem nome)";
      const row = map.get(title) ?? { units: 0, revenue: 0, profit: 0 };
      row.units += li.quantity ?? 0;
      row.revenue += rev;
      row.profit += profit;
      map.set(title, row);
    }
  }

  return [...map.entries()]
    .sort((a, b) => b[1].profit - a[1].profit)
    .slice(0, limit)
    .map(([title, p]) => {
      const marginPct = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
      return {
        title,
        units: p.units,
        revenue: fmtMoney(p.revenue),
        profit: fmtMoney(p.profit),
        margin: formatPercent(marginPct),
        positive: p.profit >= 0,
        marginPositive: marginPct >= 0,
      };
    });
}

export type PnlLine = {
  name: string;
  revenue: number;
  cogs: number;
  shipping: number;
  fees: number;
  refunds: number;
  adSpend: number;
  netProfit: number;
  margin: number;
  orders: number;
};

export type WorkspacePnl = {
  currency: string;
  days: number;
  periodLabel: string;
  totals: Omit<PnlLine, "name">;
  stores: PnlLine[];
  cogsIncomplete: boolean;
  missingCogsCount: number;
  missingAdSpendDays: number;
};

/**
 * P&L (lucro real) por workspace a partir das orders sincronizadas.
 * Lucro = revenue líquida − COGS − envio − taxas − ad spend.
 */
export async function buildWorkspacePnl(
  workspaceId: string,
  periodInput?: PeriodInput,
  storeId?: string,
): Promise<WorkspacePnl> {
  await connectToDatabase();

  const empty: WorkspacePnl = {
    currency: "EUR",
    days: 0,
    periodLabel: "",
    totals: {
      revenue: 0,
      cogs: 0,
      shipping: 0,
      fees: 0,
      refunds: 0,
      adSpend: 0,
      netProfit: 0,
      margin: 0,
      orders: 0,
    },
    stores: [],
    cogsIncomplete: false,
    missingCogsCount: 0,
    missingAdSpendDays: 0,
  };
  if (!workspaceId) return empty;

  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const workspace = await Workspace.findById(wsId).lean();
  const currency = workspace?.baseCurrency ?? "EUR";

  const stores = await Store.find({ workspaceId: wsId, deletedAt: null })
    .select("name importStartDate createdAt ianaTimezone")
    .lean();
  if (stores.length === 0) return { ...empty, currency };

  const scoped = storeId
    ? stores.find((s) => String(s._id) === storeId)
    : null;
  const storeTz = scoped ? normalizeStoreTimezone(scoped.ianaTimezone) : null;
  const period = storeTz
    ? resolvePeriodForStore(periodInput, storeTz)
    : resolvePeriod(periodInput);
  const days = periodDayCount(period);
  const pnlSlice: PeriodSlice = {
    start: period.start,
    end: period.end,
    specificDates: period.specificDates,
  };

  empty.days = days;
  empty.periodLabel = period.label;
  const storeList = scoped ? [scoped] : stores;

  const orderMatch: Record<string, unknown> = {
    workspaceId: wsId,
    ...(storeTz
      ? orderDateMatchInTimezone(period, storeTz)
      : orderDateMatch(period)),
  };
  if (scoped) orderMatch.storeId = scoped._id;

  const rows = await Order.aggregate<{ _id: mongoose.Types.ObjectId } & StoreAgg>([
    { $match: orderMatch },
    {
      $group: {
        _id: "$storeId",
        revenue: netRevenueSumExpr,
        cogs: { $sum: "$cogs" },
        shipping: { $sum: "$shipping" },
        fees: { $sum: "$fees" },
        refunds: { $sum: "$refunded" },
        orders: { $sum: 1 },
      },
    },
  ]);
  const byStore = new Map<string, StoreAgg>(rows.map((r) => [String(r._id), r]));

  const adSpendByStore = new Map<string, number>();
  await Promise.all(
    storeList.map(async (s) => {
      const v = await sumAdSpendForPeriod([s._id], pnlSlice);
      adSpendByStore.set(String(s._id), v);
    }),
  );

  const toLine = (name: string, a: StoreAgg, storeOid: mongoose.Types.ObjectId): PnlLine => {
    const storeAd = adSpendByStore.get(String(storeOid)) ?? 0;
    const netProfit = calcProfit(a, storeAd);
    return {
      name,
      revenue: a.revenue,
      cogs: a.cogs,
      shipping: a.shipping,
      fees: a.fees,
      refunds: a.refunds,
      adSpend: storeAd,
      netProfit,
      margin: a.revenue > 0 ? (netProfit / a.revenue) * 100 : 0,
      orders: a.orders,
    };
  };

  const storeLines = storeList
    .map((s) =>
      toLine(
        s.name,
        byStore.get(String(s._id)) ?? {
          revenue: 0,
          cogs: 0,
          shipping: 0,
          fees: 0,
          refunds: 0,
          orders: 0,
        },
        s._id,
      ),
    )
    .sort((a, b) => b.revenue - a.revenue);

  const t = storeLines.reduce(
    (acc, l) => {
      acc.revenue += l.revenue;
      acc.cogs += l.cogs;
      acc.shipping += l.shipping;
      acc.fees += l.fees;
      acc.refunds += l.refunds;
      acc.orders += l.orders;
      return acc;
    },
    { revenue: 0, cogs: 0, shipping: 0, fees: 0, refunds: 0, orders: 0 },
  );
  const totalAdSpend = [...adSpendByStore.values()].reduce((s, v) => s + v, 0);
  const netProfit = calcProfit(t, totalAdSpend);
  const storeOids = storeList.map((s) => s._id);
  const [missingCogsCount, missingAdSpendDays] = await Promise.all([
    countSoldVariantsMissingCost(storeOids, pnlSlice),
    sumMissingAdSpendDays(storeList, currency),
  ]);

  return {
    currency,
    days,
    periodLabel: period.label,
    totals: {
      ...t,
      adSpend: totalAdSpend,
      netProfit,
      margin: t.revenue > 0 ? (netProfit / t.revenue) * 100 : 0,
    },
    stores: storeLines,
    cogsIncomplete: missingCogsCount > 0,
    missingCogsCount,
    missingAdSpendDays,
  };
}

/** Resumo vazio quando o workspace ainda não tem lojas ligadas. */
function emptySummary(currency = "EUR"): DashboardSummary {
  const zero = formatCurrency(0, currency);
  const zeroCompact = formatCurrencyCompact(0, currency);
  return {
    kpis: [
      { label: "Revenue", value: zeroCompact, title: zero },
      { label: "Net Profit", value: zeroCompact, title: zero },
      { label: "Margem %", value: "0,0%" },
      { label: "Ad Spend", value: zeroCompact, title: zero },
      { label: "ROAS", value: "—" },
      { label: "MER", value: "—" },
    ],
    stores: [],
    scopeName: null,
    scopeDomain: null,
    topProducts: [],
    storeDashboard: null,
    generatedAt: new Date().toISOString(),
    dailyNotes: [],
    cogsIncomplete: false,
    missingCogsCount: 0,
    missingAdSpendDays: 0,
    profitChart: [],
    dailyMetrics: [],
    extendedKpis: [],
  };
}

/**
 * Calcula o resumo do dashboard para um workspace, a partir das orders
 * sincronizadas. Lucro = revenue líquida − COGS − envio − taxas − ad spend manual.
 */
export async function buildWorkspaceSummary(
  workspaceId: string,
  storeId?: string,
  periodInput?: PeriodInput,
): Promise<DashboardSummary> {
  await connectToDatabase();

  if (!workspaceId) return emptySummary();

  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const workspace = await Workspace.findById(wsId).lean();
  const currency = workspace?.baseCurrency ?? "EUR";

  const allStores = await Store.find({ workspaceId: wsId, deletedAt: null })
    .select(
      "name shopDomain displayUrl paymentsBalance importStartDate createdAt analyticsSessionCountry ianaTimezone lastSessionMetricsError",
    )
    .lean();

  if (allStores.length === 0) return emptySummary(currency);

  // Vista de uma só loja (se válida e pertencente ao workspace).
  const scoped = storeId
    ? allStores.find((s) => String(s._id) === storeId)
    : null;
  const stores = scoped ? [scoped] : allStores;
  const scopeName = scoped ? scoped.name : null;
  const scopeDomain = scoped ? getStoreDisplayUrl(scoped) : null;
  const storeTz = scoped ? normalizeStoreTimezone(scoped.ianaTimezone) : null;

  const period = storeTz
    ? resolvePeriodForStore(periodInput, storeTz)
    : resolvePeriod(periodInput);
  const {
    start,
    end,
    label: periodLabel,
    prevStart,
    prevEnd,
    prevLabel: prevPeriodLabel,
    prevSpecificDates,
  } = period;

  const currentSlice: PeriodSlice = {
    start,
    end,
    specificDates: period.specificDates,
  };
  const prevSlice: PeriodSlice = prevSpecificDates
    ? { start: prevStart, end: prevEnd, specificDates: prevSpecificDates }
    : { start: prevStart, end: prevEnd };

  const importFloor = scoped
    ? resolveImportFloor(scoped.importStartDate, scoped.createdAt)
    : earliestImportFloor(stores);
  const chartSlice: PeriodSlice = clampSliceToImportFloor(
    currentSlice,
    importFloor,
  );

  async function aggregateOrders(
    slice: PeriodSlice,
    storeOid?: mongoose.Types.ObjectId,
  ): Promise<StoreAgg> {
    const match: Record<string, unknown> = {
      workspaceId: wsId,
      ...(storeTz
        ? orderDateMatchInTimezone(slice, storeTz)
        : orderDateMatch(slice)),
    };
    if (storeOid) match.storeId = storeOid;

    const [row] = await Order.aggregate<StoreAgg>([
      { $match: match },
      {
        $group: {
          _id: null,
          revenue: netRevenueSumExpr,
          cogs: { $sum: "$cogs" },
          shipping: { $sum: "$shipping" },
          fees: { $sum: "$fees" },
          refunds: { $sum: "$refunded" },
          orders: { $sum: 1 },
        },
      },
    ]);
    return row ?? {
      revenue: 0,
      cogs: 0,
      shipping: 0,
      fees: 0,
      refunds: 0,
      orders: 0,
    };
  }

  const orderMatch: Record<string, unknown> = {
    workspaceId: wsId,
    ...(storeTz
      ? orderDateMatchInTimezone(currentSlice, storeTz)
      : orderDateMatch(currentSlice)),
  };
  if (scoped) orderMatch.storeId = scoped._id;

  const rows = await Order.aggregate<{ _id: mongoose.Types.ObjectId } & StoreAgg>([
    { $match: orderMatch },
    {
      $group: {
        _id: "$storeId",
        revenue: netRevenueSumExpr,
        cogs: { $sum: "$cogs" },
        shipping: { $sum: "$shipping" },
        fees: { $sum: "$fees" },
        refunds: { $sum: "$refunded" },
        orders: { $sum: 1 },
      },
    },
  ]);

  const byStore = new Map<string, StoreAgg>(
    rows.map((r) => [String(r._id), r]),
  );

  const fmtMoney = (v: number) => formatCurrency(v, currency);
  const fmtMargin = (rev: number, profit: number) =>
    rev > 0 ? formatPercent((profit / rev) * 100) : "—";

  const storeOids = stores.map((s) => s._id);
  const adSpend = await sumAdSpendForPeriod(storeOids, currentSlice);
  const prevAdSpend = await sumAdSpendForPeriod(storeOids, prevSlice);

  const [missingCogsCount, missingAdSpendDays] = await Promise.all([
    countSoldVariantsMissingCost(storeOids, currentSlice),
    sumMissingAdSpendDays(stores, currency),
  ]);
  const cogsIncomplete = missingCogsCount > 0;

  const adSpendByStore = new Map<string, number>();
  await Promise.all(
    stores.map(async (s) => {
      const v = await sumAdSpendForPeriod([s._id], currentSlice);
      adSpendByStore.set(String(s._id), v);
    }),
  );

  const summaryStores = await Promise.all(
    stores.map(async (s) => {
      const a = byStore.get(String(s._id)) ?? {
        revenue: 0,
        cogs: 0,
        shipping: 0,
        fees: 0,
        refunds: 0,
        orders: 0,
      };
      const storeAd = adSpendByStore.get(String(s._id)) ?? 0;
      const profit = calcProfit(a, storeAd);
      const roas =
        storeAd > 0 ? (a.revenue / storeAd).toFixed(2).replace(".", ",") : "—";
      const trend = await buildStoreSparkline(
        wsId,
        s._id,
        currentSlice,
        storeTz,
      );
      return {
        name: s.name,
        revenue: fmtMoney(a.revenue),
        profit: fmtMoney(profit),
        margin: fmtMargin(a.revenue, profit),
        roas,
        positive: profit >= 0,
        trend,
        sortRevenue: a.revenue,
      };
    }),
  );

  const sortedStores: SummaryStore[] = summaryStores
    .sort((x, y) => y.sortRevenue - x.sortRevenue)
    .map(({ sortRevenue, ...rest }) => {
      void sortRevenue;
      return rest;
    });

  const totals = [...byStore.values()].reduce(
    (acc, a) => {
      acc.revenue += a.revenue;
      acc.cogs += a.cogs;
      acc.shipping += a.shipping;
      acc.fees += a.fees;
      acc.refunds += a.refunds;
      acc.orders += a.orders;
      return acc;
    },
    { revenue: 0, cogs: 0, shipping: 0, fees: 0, refunds: 0, orders: 0 },
  );

  const netProfit = calcProfit(totals, adSpend);
  const margin = totals.revenue > 0 ? (netProfit / totals.revenue) * 100 : 0;

  const money = (v: number): SummaryKpi["value"] =>
    formatCurrencyCompact(v, currency);
  const deltaSuffix = `vs ${prevPeriodLabel}`;

  let kpis: SummaryKpi[];
  let extendedKpis: SummaryKpi[] = [];

  if (scoped) {
    const cur = await aggregateOrders(currentSlice, scoped._id);
    const prev = await aggregateOrders(prevSlice, scoped._id);
    const curAdSpend = adSpend;
    const curProfit = calcProfit(cur, curAdSpend);
    const prevProfit = calcProfit(prev, prevAdSpend);
    const curMargin =
      cur.revenue > 0 ? (curProfit / cur.revenue) * 100 : 0;
    const prevMargin =
      prev.revenue > 0 ? (prevProfit / prev.revenue) * 100 : 0;
    const curBer = berRoas(cur);
    const prevBer = berRoas(prev);
    const curCm = contributionMarginPct(cur);
    const prevCm = contributionMarginPct(prev);
    const curRoas = curAdSpend > 0 ? cur.revenue / curAdSpend : null;
    const prevRoas = prevAdSpend > 0 ? prev.revenue / prevAdSpend : null;

    kpis = [
      {
        label: "REV",
        value: money(cur.revenue),
        title: `Vendas líquidas · ${fmtMoney(cur.revenue)}`,
        delta: deltaPct(cur.revenue, prev.revenue),
        deltaLabel: deltaSuffix,
        icon: "euro",
      },
      {
        label: "Net Profit",
        value: money(curProfit),
        title: cogsIncomplete
          ? `${fmtMoney(curProfit)} · ${missingCogsNote(missingCogsCount)}`
          : fmtMoney(curProfit),
        delta: deltaPct(curProfit, prevProfit),
        deltaLabel: deltaSuffix,
        icon: "euro",
      },
      {
        label: "Margem %",
        value: formatPercent(curMargin),
        delta: curMargin - prevMargin,
        deltaLabel: deltaSuffix,
        deltaIsPoints: true,
        icon: "percent",
      },
      {
        label: "ROAS",
        value: curRoas != null ? curRoas.toFixed(2).replace(".", ",") : "—",
        delta:
          curRoas != null && prevRoas != null
            ? deltaPct(curRoas, prevRoas)
            : undefined,
        deltaLabel: curRoas != null ? deltaSuffix : undefined,
        icon: "target",
      },
      {
        label: "BER",
        value: fmtRoasRatio(curBer),
        title:
          curBer != null
            ? `Break-even ROAS — abaixo disto há prejuízo (margem contrib. ${formatPercent(curCm)})`
            : "Sem margem de contribuição positiva",
        delta:
          curBer != null && prevBer != null
            ? deltaPct(curBer, prevBer)
            : undefined,
        deltaLabel: curBer != null ? deltaSuffix : undefined,
        icon: "target",
      },
    ];
  } else {
    kpis = [
      { label: "Revenue", value: money(totals.revenue), title: fmtMoney(totals.revenue) },
      {
        label: "Net Profit",
        value: money(netProfit),
        title: cogsIncomplete
          ? `${fmtMoney(netProfit)} · ${missingCogsNote(missingCogsCount)}`
          : fmtMoney(netProfit),
      },
      { label: "Margem %", value: formatPercent(margin) },
      { label: "Ad Spend", value: money(adSpend), title: fmtMoney(adSpend) },
      {
        label: "ROAS",
        value:
          adSpend > 0
            ? (totals.revenue / adSpend).toFixed(2).replace(".", ",")
            : "—",
      },
      {
        label: "MER",
        value:
          adSpend > 0
            ? (totals.revenue / adSpend).toFixed(2).replace(".", ",")
            : "—",
      },
    ];
    const curAll = await aggregateOrders(currentSlice);
    const prevAll = await aggregateOrders(prevSlice);
    extendedKpis = buildExtendedWorkspaceKpis(
      curAll,
      prevAll,
      adSpend,
      prevAdSpend,
      deltaSuffix,
      money,
      fmtMoney,
    );
  }

  const profitChart = await buildDailyProfitSeries(
    wsId,
    storeOids,
    scoped ? currentSlice : chartSlice,
    fmtMoney,
    storeTz,
  );

  // Vista por loja: produtos por lucro + waterfall + payout + métricas diárias.
  let topProducts: TopProduct[] = [];
  let storeDashboard: StoreDashboardData | null = null;
  let dailyNotes: StoreDailyNoteView[] = [];
  let dailyMetrics: StoreDailyMetricRow[] = [];

  if (scoped) {
    const cur = await aggregateOrders(currentSlice, scoped._id);
    const curAdSpend = adSpend;

    topProducts = await buildTopProductsByProfit(
      scoped._id,
      currentSlice,
      fmtMoney,
      5,
      storeTz,
    );

    const waterfall: WaterfallStep[] = [
      {
        key: "revenue",
        label: "REV (líquida)",
        value: cur.revenue,
        display: fmtMoney(cur.revenue),
        type: "start",
      },
      {
        key: "cogs",
        label: "COGS",
        value: -cur.cogs,
        display: fmtMoney(-cur.cogs),
        type: "negative",
      },
      {
        key: "shipping",
        label: "Envio",
        value: -cur.shipping,
        display: fmtMoney(-cur.shipping),
        type: "negative",
      },
      {
        key: "fees",
        label: "Taxas",
        value: -cur.fees,
        display: fmtMoney(-cur.fees),
        type: "negative",
      },
      {
        key: "adspend",
        label: "Ad Spend",
        value: -curAdSpend,
        display: fmtMoney(-curAdSpend),
        type: "negative",
      },
      {
        key: "net",
        label: "Net Profit",
        value: calcProfit(cur, curAdSpend),
        display: fmtMoney(calcProfit(cur, curAdSpend)),
        type: "total",
      },
    ];

    const payoutAmount = scoped.paymentsBalance ?? 0;
    const storePayouts = await Payout.find({
      workspaceId: wsId,
      storeId: scoped._id,
    }).lean();

    const incomingStatuses = new Set([
      "scheduled",
      "in_transit",
      "pending",
      "action_required",
    ]);
    const nextPayout = storePayouts
      .filter(
        (p) =>
          incomingStatuses.has(normPayoutStatus(p.status)) && p.issuedAt,
      )
      .sort(
        (a, b) =>
          new Date(a.issuedAt!).getTime() - new Date(b.issuedAt!).getTime(),
      )[0];

    const nextDate = nextPayout?.issuedAt
      ? new Date(nextPayout.issuedAt)
      : null;

    dailyNotes = await fetchStoreDailyNotesForPeriod(
      wsId,
      scoped._id,
      currentSlice,
    );

    const storeImportFloorKey = scoped
      ? importDateKey(scoped.importStartDate, scoped.createdAt, storeTz)
      : null;

    const [funnelCur, funnelPrev, dailyRows] = await Promise.all([
      aggregateSessionFunnelFromDb(
        scoped._id,
        scoped.analyticsSessionCountry,
        currentSlice,
        storeImportFloorKey,
        storeTz,
      ),
      aggregateSessionFunnelFromDb(
        scoped._id,
        scoped.analyticsSessionCountry,
        prevSlice,
        storeImportFloorKey,
        storeTz,
      ),
      buildStoreDailyMetrics(
        wsId,
        scoped._id,
        currentSlice,
        fmtMoney,
        scoped.analyticsSessionCountry,
        storeTz,
      ),
    ]);
    const noteByDate = new Map(dailyNotes.map((n) => [n.date, n]));
    dailyMetrics = dailyRows.map((row) => {
      const note = noteByDate.get(row.dateKey);
      return {
        ...row,
        hasNote: Boolean(note),
        notePreview: note?.text?.trim() || undefined,
      };
    });

    const sessionErr = scoped.lastSessionMetricsError ?? null;
    let funnelError = funnelCur.error;
    if (sessionErr && funnelCur.sessions === 0) {
      funnelError = `Falha ao obter sessões: ${sessionErr}`;
    } else if (sessionErr && funnelCur.error) {
      funnelError = `${funnelCur.error} (${sessionErr})`;
    }

    const prevForExtended = await aggregateOrders(prevSlice, scoped._id);
    extendedKpis = buildExtendedStoreKpis(
      cur,
      prevForExtended,
      curAdSpend,
      prevAdSpend,
      funnelCur,
      funnelPrev,
      deltaSuffix,
      money,
      fmtMoney,
    );

    storeDashboard = {
      waterfall,
      payout: {
        amount: payoutAmount,
        amountFmt: fmtMoney(payoutAmount),
        nextDate: nextDate?.toISOString() ?? null,
        nextDateLabel: nextDate
          ? nextDate.toLocaleDateString("pt-PT", {
              day: "numeric",
              month: "short",
            })
          : null,
      },
      periodLabel,
      prevPeriodLabel,
      periodIsSingleDay: periodIsSingleDay(period),
      dailyNotes,
      funnelKpis: buildFunnelKpis(funnelCur, funnelPrev, deltaSuffix),
      funnelError,
      sessionCountryLabel: funnelCur.countryLabel,
      lastSessionMetricsError: sessionErr,
    };
  }

  return {
    kpis,
    stores: sortedStores,
    scopeName,
    scopeDomain,
    topProducts,
    storeDashboard,
    dailyNotes,
    cogsIncomplete,
    missingCogsCount,
    missingAdSpendDays,
    profitChart,
    dailyMetrics,
    extendedKpis,
    generatedAt: new Date().toISOString(),
  };
}

/** Ranking de produtos por lucro (página Produtos da loja). */
export async function buildStoreProductRanking(
  workspaceId: string,
  storeId: string,
  periodInput?: PeriodInput,
  limit = 20,
): Promise<{
  products: TopProduct[];
  storeName: string;
  periodLabel: string;
}> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const store = await Store.findOne({
    _id: storeId,
    workspaceId: wsId,
    deletedAt: null,
  })
    .select("name currency ianaTimezone")
    .lean();
  if (!store) {
    return { products: [], storeName: "", periodLabel: "" };
  }

  const storeTz = normalizeStoreTimezone(store.ianaTimezone);
  const period = resolvePeriodForStore(periodInput, storeTz);
  const currency =
    (await Workspace.findById(wsId).lean())?.baseCurrency ??
    store.currency ??
    "EUR";
  const fmtMoney = (v: number) => formatCurrency(v, currency);
  const slice: PeriodSlice = {
    start: period.start,
    end: period.end,
    specificDates: period.specificDates,
  };

  const products = await buildTopProductsByProfit(
    store._id,
    slice,
    fmtMoney,
    limit,
    storeTz,
  );

  return {
    products,
    storeName: store.name,
    periodLabel: period.label,
  };
}

export type StoreDayFinancials = {
  revenue: number;
  cogs: number;
  refunds: number;
  shipping: number;
  fees: number;
  adSpend: number;
  profit: number;
  missingCogs: number;
  sessions: number | null;
  atcPct: number | null;
  checkoutPct: number | null;
  cvrPct: number | null;
};

function pctFromCounts(part: number, total: number): number | null {
  if (total <= 0) return null;
  return (part / total) * 100;
}

/** Métricas financeiras e funil de um único dia (relatório diário). */
export async function fetchStoreDayFinancials(
  workspaceId: string,
  storeId: string,
  dateKey: string,
): Promise<StoreDayFinancials | null> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const store = await Store.findOne({
    _id: storeId,
    workspaceId: wsId,
    deletedAt: null,
  })
    .select("ianaTimezone analyticsSessionCountry")
    .lean();
  if (!store) return null;

  const day = parseDateInput(dateKey);
  if (!day) return null;

  const storeTz = normalizeStoreTimezone(store.ianaTimezone);
  const slice: PeriodSlice = {
    start: day,
    end: day,
    specificDates: [dateKey],
  };

  const storeOid = store._id;
  const [orderByDay, adByDay, sessionsByDay, missingCogsByDay] =
    await Promise.all([
      aggregateDailyOrders(wsId, [storeOid], slice, storeTz),
      aggregateDailyAdSpend([storeOid], slice, storeTz),
      loadDailySessionCountsForSlice(
        storeOid,
        store.analyticsSessionCountry,
        slice,
        storeTz,
      ),
      countMissingCogsByDay([storeOid], slice, storeTz),
    ]);

  const o = orderByDay.get(dateKey) ?? {
    revenue: 0,
    cogs: 0,
    shipping: 0,
    fees: 0,
    refunds: 0,
  };
  const ad = adByDay.get(dateKey) ?? 0;
  const profit = calcProfit(o, ad);
  const missingCogs = missingCogsByDay.get(dateKey) ?? 0;
  const sess = sessionsByDay.get(dateKey);

  return {
    revenue: o.revenue,
    cogs: o.cogs,
    refunds: o.refunds,
    shipping: o.shipping,
    fees: o.fees,
    adSpend: ad,
    profit,
    missingCogs,
    sessions: sess?.sessions ?? null,
    atcPct: sess ? pctFromCounts(sess.cart, sess.sessions) : null,
    checkoutPct: sess ? pctFromCounts(sess.checkout, sess.sessions) : null,
    cvrPct: sess ? pctFromCounts(sess.completed, sess.sessions) : null,
  };
}
