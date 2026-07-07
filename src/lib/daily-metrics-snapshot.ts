import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { DailyMetric } from "@/models/DailyMetric";
import { Dispute } from "@/models/Dispute";
import { Order } from "@/models/Order";
import { fetchStoreDayFinancials } from "@/lib/metrics";
import {
  loadWorkspaceExpensesLean,
  sumLoadedExpensesForDay,
} from "@/lib/expenses";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { formatDateInput, addDays, startOfDay, parseDateInput } from "@/lib/period";
import { calcPoas } from "@/lib/profit";
import {
  dayKeysBetweenInTimezone,
  importDateKey,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import { Store } from "@/models/Store";

type DayMetricPayload = {
  workspaceId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  dateKey: string;
  revenue: number;
  orders: number;
  cogs: number;
  shippingCost: number;
  feesTotal: number;
  refunds: number;
  chargebacks: number;
  adSpend: number;
  adSpendMeta: number;
  adSpendGoogle: number;
  adSpendTiktok: number;
  operatingExpenses: number;
  netProfit: number;
  margin: number;
  roas: number | null;
  poas: number | null;
  sessions: number | null;
  atcPct: number | null;
  cvrPct: number | null;
  snapshottedAt: Date;
};

async function buildDayMetricPayload(
  workspaceId: string,
  storeId: string,
  dateKey: string,
): Promise<DayMetricPayload | null> {
  await connectToDatabase();
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const wsOid = new mongoose.Types.ObjectId(workspaceId);

  const financials = await fetchStoreDayFinancials(
    workspaceId,
    storeId,
    dateKey,
  );
  if (!financials) return null;

  const dayStart = new Date(dateKey + "T00:00:00");
  const dayEnd = new Date(dateKey + "T23:59:59.999");

  const [orders, chargebackAgg, adRow, expenseRows] = await Promise.all([
    Order.countDocuments({
      workspaceId: wsOid,
      storeId: storeOid,
      orderDate: { $gte: dayStart, $lte: dayEnd },
    }),
    Dispute.aggregate<{ total: number }>([
      {
        $match: {
          workspaceId: wsOid,
          storeId: storeOid,
          initiatedAt: { $gte: dayStart, $lte: dayEnd },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    ManualAdSpend.findOne({ storeId: storeOid, dateKey })
      .select("amount lines")
      .lean(),
    loadWorkspaceExpensesLean(wsOid),
  ]);

  const opEx = sumLoadedExpensesForDay(expenseRows, dateKey, storeId);
  const adSpend = financials.adSpend ?? adRow?.amount ?? 0;
  const revenue = financials.revenue;
  const margin = revenue > 0 ? (financials.profit / revenue) * 100 : 0;
  const roas = adSpend > 0 ? revenue / adSpend : null;
  const poas = adSpend > 0 ? calcPoas(financials.profit, adSpend) : null;

  const lineSpend = (p: string) =>
    adRow?.lines?.find((l) => l.platform === p)?.amount ?? 0;

  return {
    workspaceId: wsOid,
    storeId: storeOid,
    dateKey,
    revenue,
    orders,
    cogs: financials.cogs,
    shippingCost: financials.shipping,
    feesTotal: financials.fees,
    refunds: financials.refunds,
    chargebacks: chargebackAgg[0]?.total ?? 0,
    adSpend,
    adSpendMeta: lineSpend("meta"),
    adSpendGoogle: lineSpend("google"),
    adSpendTiktok: lineSpend("tiktok"),
    operatingExpenses: opEx,
    netProfit: financials.profit,
    margin,
    roas,
    poas,
    sessions: financials.sessions,
    atcPct: financials.atcPct,
    cvrPct: financials.cvrPct,
    snapshottedAt: new Date(),
  };
}

/** Grava ou actualiza snapshot de um dia com a lógica actual de lucro. */
export async function upsertDayMetrics(
  workspaceId: string,
  storeId: string,
  dateKey: string,
): Promise<"updated" | "skipped"> {
  const payload = await buildDayMetricPayload(workspaceId, storeId, dateKey);
  if (!payload) return "skipped";

  await DailyMetric.findOneAndUpdate(
    { storeId: payload.storeId, dateKey },
    { $set: payload },
    { upsert: true },
  );
  return "updated";
}

/** @deprecated usar upsertDayMetrics */
export async function snapshotDayMetrics(
  workspaceId: string,
  storeId: string,
  dateKey: string,
): Promise<"created" | "exists" | "skipped"> {
  const res = await upsertDayMetrics(workspaceId, storeId, dateKey);
  return res === "updated" ? "created" : "skipped";
}

/**
 * Grava snapshot de ontem (sempre recalculado).
 * Chamado após sync da loja.
 */
export async function snapshotYesterdayMetrics(
  workspaceId: string,
  storeId: string,
): Promise<"created" | "exists" | "skipped"> {
  const yesterdayKey = formatDateInput(addDays(startOfDay(new Date()), -1));
  const res = await upsertDayMetrics(workspaceId, storeId, yesterdayKey);
  return res === "updated" ? "created" : "skipped";
}

export type DailyMetricsBackfillResult = {
  storeId: string;
  created: number;
  exists: number;
  skipped: number;
  daysProcessed: number;
};

export type DailyMetricsReconcileResult = {
  storeId: string;
  updated: number;
  skipped: number;
  daysProcessed: number;
};

/**
 * Recalcula snapshots entre importStartDate e ontem (máx. por execução).
 * Substitui valores antigos (ex. lucro com despesas rateadas).
 */
export async function reconcileDailyMetricsForStore(
  storeId: string,
  opts?: { maxDays?: number },
): Promise<DailyMetricsReconcileResult> {
  await connectToDatabase();
  const maxDays = opts?.maxDays ?? 90;
  const store = await Store.findById(storeId)
    .select("workspaceId importStartDate createdAt ianaTimezone")
    .lean();
  if (!store) {
    return { storeId, updated: 0, skipped: 0, daysProcessed: 0 };
  }

  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const floor = importDateKey(store.importStartDate, store.createdAt, tz);
  if (!floor) {
    return { storeId, updated: 0, skipped: 0, daysProcessed: 0 };
  }

  const yesterday = formatDateInput(addDays(startOfDay(new Date()), -1));
  const floorDate = parseDateInput(floor);
  const yesterdayDate = parseDateInput(yesterday);
  if (!floorDate || !yesterdayDate || yesterday < floor) {
    return { storeId, updated: 0, skipped: 0, daysProcessed: 0 };
  }

  const allKeys = dayKeysBetweenInTimezone(floorDate, yesterdayDate, tz);
  const keys = allKeys.slice(-maxDays);

  let updated = 0;
  let skipped = 0;

  for (const dateKey of keys) {
    const res = await upsertDayMetrics(
      String(store.workspaceId),
      storeId,
      dateKey,
    );
    if (res === "updated") updated++;
    else skipped++;
  }

  return {
    storeId,
    updated,
    skipped,
    daysProcessed: keys.length,
  };
}

/**
 * Preenche snapshots em falta entre importStartDate e ontem (máx. por execução).
 */
export async function backfillDailyMetricsForStore(
  storeId: string,
  opts?: { maxDays?: number },
): Promise<DailyMetricsBackfillResult> {
  const res = await reconcileDailyMetricsForStore(storeId, opts);
  return {
    storeId: res.storeId,
    created: res.updated,
    exists: 0,
    skipped: res.skipped,
    daysProcessed: res.daysProcessed,
  };
}
