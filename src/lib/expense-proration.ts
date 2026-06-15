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
    let total = 0;
    let cursor = new Date(activeStart.getFullYear(), activeStart.getMonth(), 1);
    while (cursor <= activeEnd) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const monthStart = startOfDay(new Date(y, m, 1));
      const monthEnd = endOfDay(new Date(y, m, daysInMonth(y, m)));
      const days = overlapDays(activeStart, activeEnd, monthStart, monthEnd);
      if (days > 0) {
        total += expense.amountBase * (days / daysInMonth(y, m));
      }
      cursor = new Date(y, m + 1, 1);
    }
    return total;
  }

  // yearly — rateia pelos dias do período activo
  const activeDays = overlapDays(activeStart, activeEnd, activeStart, activeEnd);
  const yearDays = 365.25;
  return expense.amountBase * (activeDays / yearDays);
}

export { dateKey as expenseDateKey };
