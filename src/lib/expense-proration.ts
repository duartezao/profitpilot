import type { ExpenseFrequency } from "@/models/Expense";

const MS_DAY = 86_400_000;

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Dia de cobrança no mês (ex.: 31 → último dia em fevereiro). */
function billingDateKey(year: number, month: number, billingDay: number): string {
  const dim = daysInMonth(year, month);
  const day = Math.min(billingDay, dim);
  return dateKey(new Date(year, month, day));
}

function overlapDays(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): number {
  const a = startOfDay(start > rangeStart ? start : rangeStart);
  const b = endOfDay(end < rangeEnd ? end : rangeEnd);
  if (a > b) return 0;
  return Math.floor((b.getTime() - a.getTime()) / MS_DAY) + 1;
}

export type ExpenseProrationInput = {
  amountBase: number;
  frequency: ExpenseFrequency;
  startDateKey: string;
  endDateKey?: string | null;
};

function monthlyChargeDates(
  expense: ExpenseProrationInput,
  expenseStart: Date,
  expenseEnd: Date,
  rangeStart: Date,
  rangeEnd: Date,
): string[] {
  const [, , billingDay] = expense.startDateKey.split("-").map(Number);
  const keys: string[] = [];
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const endCursor = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);

  while (cursor <= endCursor) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const key = billingDateKey(y, m, billingDay);
    const billDate = startOfDay(parseDateKey(key));
    if (billDate >= expenseStart && billDate <= expenseEnd) {
      if (billDate >= rangeStart && billDate <= rangeEnd) {
        keys.push(key);
      }
    }
    cursor = new Date(y, m + 1, 1);
  }
  return keys;
}

function yearlyChargeDates(
  expense: ExpenseProrationInput,
  expenseStart: Date,
  expenseEnd: Date,
  rangeStart: Date,
  rangeEnd: Date,
): string[] {
  const [, startMonth, billingDay] = expense.startDateKey.split("-").map(Number);
  const monthIndex = startMonth - 1;
  const keys: string[] = [];

  for (let y = rangeStart.getFullYear(); y <= rangeEnd.getFullYear(); y++) {
    const key = billingDateKey(y, monthIndex, billingDay);
    const billDate = startOfDay(parseDateKey(key));
    if (billDate < expenseStart || billDate > expenseEnd) continue;
    if (billDate >= rangeStart && billDate <= rangeEnd) {
      keys.push(key);
    }
  }
  return keys;
}

/** Valor da despesa alocado ao intervalo [periodStart, periodEnd] (inclusive). */
export function expenseAmountForPeriod(
  expense: ExpenseProrationInput,
  periodStart: Date,
  periodEnd: Date,
): number {
  const expenseStart = startOfDay(parseDateKey(expense.startDateKey));
  const expenseEnd = expense.endDateKey
    ? endOfDay(parseDateKey(expense.endDateKey))
    : endOfDay(periodEnd);

  const activeStart = expenseStart > periodStart ? expenseStart : periodStart;
  const activeEnd = expenseEnd < periodEnd ? expenseEnd : periodEnd;
  if (activeStart > activeEnd) return 0;

  if (expense.frequency === "one-time") {
    if (expenseStart >= periodStart && expenseStart <= periodEnd) {
      return expense.amountBase;
    }
    return 0;
  }

  if (expense.frequency === "monthly") {
    const charges = monthlyChargeDates(
      expense,
      expenseStart,
      expenseEnd,
      activeStart,
      activeEnd,
    );
    return charges.length * expense.amountBase;
  }

  if (expense.frequency === "yearly") {
    const charges = yearlyChargeDates(
      expense,
      expenseStart,
      expenseEnd,
      activeStart,
      activeEnd,
    );
    return charges.length * expense.amountBase;
  }

  return 0;
}

/** Valor da despesa num único dia civil. */
export function expenseAmountForDay(
  expense: ExpenseProrationInput,
  dateKey: string,
): number {
  const day = parseDateKey(dateKey);
  if (!day) return 0;
  return expenseAmountForPeriod(
    expense,
    startOfDay(day),
    endOfDay(day),
  );
}

export { dateKey as expenseDateKey, overlapDays };
