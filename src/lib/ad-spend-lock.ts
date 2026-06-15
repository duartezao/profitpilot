import { formatDateInput, startOfDay } from "@/lib/period";

/** Dia civil de hoje (YYYY-MM-DD). */
export function getTodayDateKey(now = new Date()): string {
  return formatDateInput(startOfDay(now));
}

/**
 * Dias anteriores a hoje estão fechados para sync de ads:
 * ontem já não pode receber mais gasto quando estamos noutro dia.
 */
export function isAdSpendDayLockedForApi(dateKey: string, now = new Date()): boolean {
  return dateKey < getTodayDateKey(now);
}

/** Só o dia de hoje é atualizado em cada sync automático de ads. */
export function isAdSpendTodayOpen(dateKey: string, now = new Date()): boolean {
  return dateKey === getTodayDateKey(now);
}
