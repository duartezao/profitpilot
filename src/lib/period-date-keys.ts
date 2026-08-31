import { formatDateInput, parseDateInput, startOfDay, type ResolvedPeriod } from "@/lib/period";

export type PeriodDateKeys = {
  label: string;
  startKey: string;
  endKey: string;
  specificDates?: string[];
};

export function periodToDateKeys(
  period: Pick<ResolvedPeriod, "start" | "end" | "label" | "specificDates">,
): PeriodDateKeys {
  return {
    label: period.label,
    startKey: formatDateInput(startOfDay(period.start)),
    endKey: formatDateInput(startOfDay(period.end)),
    specificDates: period.specificDates,
  };
}

export function dateKeyInPeriod(dateKey: string, period: PeriodDateKeys): boolean {
  if (period.specificDates?.length) {
    return period.specificDates.includes(dateKey);
  }
  return dateKey >= period.startKey && dateKey <= period.endKey;
}

export function periodRangeDates(period: PeriodDateKeys): { start: Date; end: Date } {
  const start = parseDateInput(period.startKey);
  const end = parseDateInput(period.endKey);
  if (!start || !end) {
    return { start: new Date(0), end: new Date() };
  }
  return {
    start: startOfDay(start),
    end: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999),
  };
}
