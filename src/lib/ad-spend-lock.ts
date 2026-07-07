import { formatDateInput, startOfDay } from "@/lib/period";
import { dateKeyInTimezone, normalizeStoreTimezone } from "@/lib/store-timezone";

/** Dia civil de hoje (YYYY-MM-DD) no fuso do servidor. */
export function getTodayDateKey(now = new Date()): string {
  return formatDateInput(startOfDay(now));
}

function todayKeyForStore(storeTimeZone?: string | null, now = new Date()): string {
  return dateKeyInTimezone(now, normalizeStoreTimezone(storeTimeZone));
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

/** Versão alinhada ao fuso da loja (usar no sync API). */
export function isAdSpendDayLockedForApiForStore(
  dateKey: string,
  storeTimeZone?: string | null,
  now = new Date(),
): boolean {
  return dateKey < todayKeyForStore(storeTimeZone, now);
}

export function isAdSpendTodayOpenForStore(
  dateKey: string,
  storeTimeZone?: string | null,
  now = new Date(),
): boolean {
  return dateKey === todayKeyForStore(storeTimeZone, now);
}
