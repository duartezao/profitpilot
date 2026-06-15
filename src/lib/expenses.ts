import "server-only";
import mongoose, { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Expense } from "@/models/Expense";
import {
  type ExpenseCategory,
  type ExpenseFrequency,
  expenseCategoryLabel,
  expenseFrequencyLabel,
} from "@/lib/expense-constants";
import { expenseAmountForPeriod } from "@/lib/expense-proration";
import type { ResolvedPeriod } from "@/lib/period";
import { parseDateInput } from "@/lib/period";

type PeriodSlice = Pick<ResolvedPeriod, "start" | "end" | "specificDates">;
import { convertToBaseCurrency } from "@/lib/fx";
import { formatCurrency } from "@/lib/utils";

export type ExpenseRow = {
  id: string;
  name: string;
  category: ExpenseCategory;
  categoryLabel: string;
  frequency: ExpenseFrequency;
  frequencyLabel: string;
  amountFmt: string;
  amountBaseFmt: string;
  storeId: string | null;
  storeName: string | null;
  startDateKey: string;
  endDateKey: string | null;
  recurring: boolean;
};

export { expenseCategoryLabel, expenseFrequencyLabel };

export async function sumWorkspaceMonthlyFixedBase(
  workspaceId: string,
): Promise<number> {
  await connectToDatabase();
  const rows = await Expense.find({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    deletedAt: null,
    storeId: null,
    frequency: "monthly",
  })
    .select("amountBase")
    .lean();
  return rows.reduce((s, r) => s + (r.amountBase ?? 0), 0);
}

export async function listWorkspaceExpenses(
  workspaceId: string,
  storeNames: Map<string, string>,
  baseCurrency: string,
): Promise<ExpenseRow[]> {
  await connectToDatabase();
  const wsOid = new mongoose.Types.ObjectId(workspaceId);
  const rows = await Expense.find({
    workspaceId: wsOid,
    deletedAt: null,
  })
    .sort({ startDateKey: -1, name: 1 })
    .lean();

  return rows.map((e) => {
    const storeId = e.storeId ? String(e.storeId) : null;
    const fmt = (v: number) => formatCurrency(v, e.currency ?? "EUR");
    const fmtBase = (v: number) => formatCurrency(v, baseCurrency);
    return {
      id: String(e._id),
      name: e.name,
      category: e.category as ExpenseCategory,
      categoryLabel: expenseCategoryLabel(e.category as ExpenseCategory),
      frequency: e.frequency as ExpenseFrequency,
      frequencyLabel: expenseFrequencyLabel(e.frequency as ExpenseFrequency),
      amountFmt: fmt(e.amount),
      amountBaseFmt: fmtBase(e.amountBase),
      storeId,
      storeName: storeId ? (storeNames.get(storeId) ?? null) : null,
      startDateKey: e.startDateKey,
      endDateKey: e.endDateKey ?? null,
      recurring: Boolean(e.recurring),
    };
  });
}

type ExpenseLean = {
  storeId?: Types.ObjectId | null;
  amountBase: number;
  frequency: string;
  startDateKey: string;
  endDateKey?: string | null;
};

function sumExpensesForScope(
  expenses: ExpenseLean[],
  period: PeriodSlice,
  storeId?: string | null,
): number {
  let total = 0;
  for (const e of expenses) {
    const eStoreId = e.storeId ? String(e.storeId) : null;
    if (storeId && eStoreId !== null && eStoreId !== storeId) continue;
    total += expenseAmountForPeriod(
      {
        amountBase: e.amountBase,
        frequency: e.frequency as ExpenseFrequency,
        startDateKey: e.startDateKey,
        endDateKey: e.endDateKey,
      },
      period.start,
      period.end,
    );
  }
  return total;
}

export type ExpenseLeanRow = ExpenseLean;

export async function loadWorkspaceExpensesLean(
  workspaceId: Types.ObjectId | string,
): Promise<ExpenseLean[]> {
  await connectToDatabase();
  const wsOid =
    workspaceId instanceof Types.ObjectId
      ? workspaceId
      : new mongoose.Types.ObjectId(workspaceId);
  return Expense.find({ workspaceId: wsOid, deletedAt: null })
    .select("storeId amountBase frequency startDateKey endDateKey")
    .lean();
}

export function sumLoadedExpenses(
  expenses: ExpenseLean[],
  period: PeriodSlice,
  storeId?: string | null,
): number {
  return sumExpensesForScope(expenses, period, storeId);
}

export function sumLoadedExpensesForDay(
  expenses: ExpenseLean[],
  dateKey: string,
  storeId?: string | null,
): number {
  const day = parseDateInput(dateKey);
  if (!day) return 0;
  const slice: PeriodSlice = {
    start: new Date(day.getFullYear(), day.getMonth(), day.getDate()),
    end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999),
  };
  return sumExpensesForScope(expenses, slice, storeId);
}

export function sumLoadedExpensesByStore(
  expenses: ExpenseLean[],
  period: PeriodSlice,
  storeIds: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const sid of storeIds) {
    out.set(sid, sumExpensesForScope(expenses, period, sid));
  }
  const workspaceLevel = sumExpensesForScope(
    expenses.filter((e) => !e.storeId),
    period,
  );
  if (workspaceLevel > 0 && storeIds.length > 0) {
    const share = workspaceLevel / storeIds.length;
    for (const sid of storeIds) {
      out.set(sid, (out.get(sid) ?? 0) + share);
    }
  }
  return out;
}

/** Soma despesas operacionais no período (moeda base). */
export async function sumOperatingExpensesForPeriod(
  workspaceId: Types.ObjectId,
  period: PeriodSlice,
  storeId?: string | null,
): Promise<number> {
  await connectToDatabase();
  const expenses = await Expense.find({
    workspaceId,
    deletedAt: null,
  })
    .select("storeId amountBase frequency startDateKey endDateKey")
    .lean();

  if (!storeId) {
    return sumExpensesForScope(expenses, period);
  }
  const forStore = expenses.filter(
    (e) => e.storeId && String(e.storeId) === storeId,
  );
  const workspace = expenses.filter((e) => !e.storeId);
  return (
    sumExpensesForScope(forStore, period) + sumExpensesForScope(workspace, period)
  );
}

/** Por loja no consolidado (despesas da loja + quota igual de despesas workspace). */
export async function sumOperatingExpensesByStore(
  workspaceId: Types.ObjectId,
  period: PeriodSlice,
  storeIds: Types.ObjectId[],
): Promise<Map<string, number>> {
  await connectToDatabase();
  const expenses = await Expense.find({
    workspaceId,
    deletedAt: null,
  })
    .select("storeId amountBase frequency startDateKey endDateKey")
    .lean();

  const out = new Map<string, number>();
  for (const sid of storeIds) {
    out.set(String(sid), sumExpensesForScope(expenses, period, String(sid)));
  }
  const workspaceLevel = sumExpensesForScope(
    expenses.filter((e) => !e.storeId),
    period,
  );
  if (workspaceLevel > 0 && storeIds.length > 0) {
    const share = workspaceLevel / storeIds.length;
    for (const sid of storeIds) {
      const key = String(sid);
      out.set(key, (out.get(key) ?? 0) + share);
    }
  }
  return out;
}

export async function convertExpenseToBase(
  amount: number,
  currency: string,
  baseCurrency: string,
  dateKey: string,
): Promise<{ amountBase: number; fxRate: number }> {
  const fx = await convertToBaseCurrency(amount, currency, baseCurrency, dateKey);
  return { amountBase: fx.amountBase, fxRate: fx.fxRate };
}
