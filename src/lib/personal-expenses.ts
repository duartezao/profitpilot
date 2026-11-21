import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { PersonalExpense } from "@/models/PersonalExpense";
import { formatCurrency } from "@/lib/utils";
import {
  loadDailyMetricSnaps,
  aggregateSnapsByDate,
} from "@/lib/daily-metrics-read";
import { Store } from "@/models/Store";
import { storeQueryForUser } from "@/lib/store-scope";
import type { StoreAccess } from "@/lib/store-access";
import type { PersonalExpenseRow } from "@/lib/personal-expenses-overview";
import {
  listRecentMonthKeys,
  resolvePersonalMonthRange,
} from "@/lib/personal-expenses-overview";

export type {
  PersonalExpenseRow,
  PersonalExpensePersonSummary,
  PersonalExpenseOverview,
} from "@/lib/personal-expenses-overview";
export {
  buildPersonalExpenseOverview,
  resolvePersonalWeekRange,
  resolvePersonalMonthRange,
  shiftPersonalWeek,
  shiftPersonalMonth,
  listRecentMonthKeys,
  sumProfitForRange,
} from "@/lib/personal-expenses-overview";

export async function listPersonalExpenses(
  workspaceId: string,
  userNames: Map<string, string>,
  baseCurrency: string,
  opts?: { fromKey?: string; toKey?: string },
): Promise<PersonalExpenseRow[]> {
  await connectToDatabase();
  const wsOid = new mongoose.Types.ObjectId(workspaceId);
  const filter: Record<string, unknown> = {
    workspaceId: wsOid,
    deletedAt: null,
  };
  if (opts?.fromKey || opts?.toKey) {
    filter.dateKey = {
      ...(opts.fromKey ? { $gte: opts.fromKey } : {}),
      ...(opts.toKey ? { $lte: opts.toKey } : {}),
    };
  }

  const rows = await PersonalExpense.find(filter)
    .sort({ dateKey: -1, createdAt: -1 })
    .lean();

  return rows.map((e) => {
    const userId = String(e.userId);
    const fmt = (v: number) => formatCurrency(v, e.currency ?? "EUR");
    const fmtBase = (v: number) => formatCurrency(v, baseCurrency);
    return {
      id: String(e._id),
      userId,
      userName: userNames.get(userId) ?? "—",
      dateKey: e.dateKey,
      description: e.description,
      amount: e.amount,
      amountFmt: fmt(e.amount),
      amountBase: e.amountBase,
      amountBaseFmt: fmtBase(e.amountBase),
      currency: (e.currency ?? "EUR").toUpperCase(),
    };
  });
}

/** Lucro diário (soma lojas) para % no painel Pessoal — últimos N meses. */
export async function loadPersonalProfitByDateKey(
  workspaceId: string,
  storeAccess: StoreAccess,
  months = 24,
): Promise<Record<string, number>> {
  await connectToDatabase();
  const stores = await Store.find(
    storeQueryForUser({ workspaceId, storeAccess }),
  )
    .select("_id")
    .lean();
  if (!stores.length) return {};

  const monthKeys = listRecentMonthKeys(months);
  const oldest = resolvePersonalMonthRange(monthKeys[monthKeys.length - 1]!);
  const newest = resolvePersonalMonthRange(monthKeys[0]!);

  const snaps = await loadDailyMetricSnaps(
    stores.map((s) => s._id),
    oldest.startKey,
    newest.endKey,
  );
  const byDate = aggregateSnapsByDate(snaps);
  const out: Record<string, number> = {};
  for (const [dateKey, row] of byDate) {
    out[dateKey] = row.netProfit;
  }
  return out;
}
