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

/** Grava snapshot imutável de um dia (se ainda não existir). */
export async function snapshotDayMetrics(
  workspaceId: string,
  storeId: string,
  dateKey: string,
): Promise<"created" | "exists" | "skipped"> {
  await connectToDatabase();
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const wsOid = new mongoose.Types.ObjectId(workspaceId);

  const existing = await DailyMetric.findOne({
    storeId: storeOid,
    dateKey,
  })
    .select("_id")
    .lean();
  if (existing) return "exists";

  const financials = await fetchStoreDayFinancials(
    workspaceId,
    storeId,
    dateKey,
  );
  if (!financials) return "skipped";

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

  await DailyMetric.create({
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
  });

  return "created";
}

/**
 * Grava snapshot imutável de ontem (se ainda não existir).
 * Chamado após sync da loja.
 */
export async function snapshotYesterdayMetrics(
  workspaceId: string,
  storeId: string,
): Promise<"created" | "exists" | "skipped"> {
  const yesterdayKey = formatDateInput(addDays(startOfDay(new Date()), -1));
  return snapshotDayMetrics(workspaceId, storeId, yesterdayKey);
}

export type DailyMetricsBackfillResult = {
  storeId: string;
  created: number;
  exists: number;
  skipped: number;
  daysProcessed: number;
};

/**
 * Preenche snapshots em falta entre importStartDate e ontem (máx. por execução).
 */
export async function backfillDailyMetricsForStore(
  storeId: string,
  opts?: { maxDays?: number },
): Promise<DailyMetricsBackfillResult> {
  await connectToDatabase();
  const maxDays = opts?.maxDays ?? 60;
  const store = await Store.findById(storeId)
    .select("workspaceId importStartDate createdAt ianaTimezone")
    .lean();
  if (!store) {
    return {
      storeId,
      created: 0,
      exists: 0,
      skipped: 0,
      daysProcessed: 0,
    };
  }

  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const floor = importDateKey(store.importStartDate, store.createdAt, tz);
  if (!floor) {
    return {
      storeId,
      created: 0,
      exists: 0,
      skipped: 0,
      daysProcessed: 0,
    };
  }
  const yesterday = formatDateInput(addDays(startOfDay(new Date()), -1));
  const floorDate = parseDateInput(floor);
  const yesterdayDate = parseDateInput(yesterday);
  if (!floorDate || !yesterdayDate || yesterday < floor) {
    return {
      storeId,
      created: 0,
      exists: 0,
      skipped: 0,
      daysProcessed: 0,
    };
  }

  const allKeys = dayKeysBetweenInTimezone(floorDate, yesterdayDate, tz);
  const storeOid = store._id;
  const existing = await DailyMetric.find({
    storeId: storeOid,
    dateKey: { $gte: floor, $lte: yesterday },
  })
    .select("dateKey")
    .lean();
  const existingSet = new Set(existing.map((e) => e.dateKey));
  const missing = allKeys.filter((k) => !existingSet.has(k)).slice(-maxDays);

  let created = 0;
  let exists = 0;
  let skipped = 0;

  for (const dateKey of missing) {
    const res = await snapshotDayMetrics(
      String(store.workspaceId),
      storeId,
      dateKey,
    );
    if (res === "created") created++;
    else if (res === "exists") exists++;
    else skipped++;
  }

  return {
    storeId,
    created,
    exists,
    skipped,
    daysProcessed: missing.length,
  };
}
