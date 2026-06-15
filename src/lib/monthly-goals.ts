import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Workspace } from "@/models/Workspace";
import { DailyMetric } from "@/models/DailyMetric";
import { Store } from "@/models/Store";
import { formatCurrency } from "@/lib/utils";
import { calcNetProfit } from "@/lib/profit";
import {
  formatDateInput,
  addDays,
  startOfDay,
} from "@/lib/period";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import {
  canAccessStore,
  type StoreAccess,
} from "@/lib/store-access";
import { scopeQueryFromInput } from "@/lib/scope-query";

export type MonthlyGoalsProgress = {
  revenueGoal: number | null;
  profitGoal: number | null;
  revenueMtd: number;
  profitMtd: number;
  dayOfMonth: number;
  daysInMonth: number;
  currency: string;
};

function daysInCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function dayOfCurrentMonth(): number {
  return new Date().getDate();
}

function monthStartKey(): string {
  const now = new Date();
  return formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
}

function todayKey(): string {
  return formatDateInput(startOfDay(new Date()));
}

export async function buildMonthlyGoalsProgress(
  workspaceId: string,
  storeId?: string,
  storeAccess: StoreAccess = "all",
): Promise<MonthlyGoalsProgress | null> {
  await connectToDatabase();
  const ws = await Workspace.findById(workspaceId)
    .select("baseCurrency targets")
    .lean();
  if (!ws) return null;

  const revenueGoal = ws.targets?.monthlyRevenueGoal ?? null;
  const profitGoal = ws.targets?.monthlyProfitGoal ?? null;
  if (revenueGoal == null && profitGoal == null) return null;

  const storeQuery = activeStoreQueryForUser({ workspaceId, storeAccess });
  if (storeId) {
    if (!canAccessStore(storeAccess, storeId)) return null;
    storeQuery._id = storeId;
  }

  const stores = await Store.find(storeQuery).select("_id").lean();
  if (!stores.length) return null;

  const storeOids = stores.map((s) => s._id);
  const from = monthStartKey();
  const to = todayKey();

  const rows = await DailyMetric.aggregate<{
    revenue: number;
    netProfit: number;
  }>([
    {
      $match: {
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        storeId: { $in: storeOids },
        dateKey: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$revenue" },
        netProfit: { $sum: "$netProfit" },
      },
    },
  ]);

  const agg = rows[0] ?? { revenue: 0, netProfit: 0 };
  return {
    revenueGoal: revenueGoal ?? null,
    profitGoal: profitGoal ?? null,
    revenueMtd: agg.revenue,
    profitMtd: agg.netProfit,
    dayOfMonth: dayOfCurrentMonth(),
    daysInMonth: daysInCurrentMonth(),
    currency: ws.baseCurrency ?? "EUR",
  };
}

export function formatMonthlyGoalsProgress(
  p: MonthlyGoalsProgress,
): { revenuePct: number | null; profitPct: number | null; revenueFmt: string; profitFmt: string } {
  const money = (v: number) => formatCurrency(v, p.currency);
  return {
    revenuePct:
      p.revenueGoal && p.revenueGoal > 0
        ? Math.min(100, (p.revenueMtd / p.revenueGoal) * 100)
        : null,
    profitPct:
      p.profitGoal && p.profitGoal > 0
        ? Math.min(100, (p.profitMtd / p.profitGoal) * 100)
        : null,
    revenueFmt: money(p.revenueMtd),
    profitFmt: money(p.profitMtd),
  };
}
