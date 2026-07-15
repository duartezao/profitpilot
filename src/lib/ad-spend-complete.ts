import { addDays, formatDateInput, parseDateInput } from "@/lib/period";
import { dateKeyInTimezone, normalizeStoreTimezone } from "@/lib/store-timezone";

/** Chave YYYY-MM-DD do dia anterior a `today`. */
export function yesterdayDateKey(today: string): string {
  const d = parseDateInput(today);
  if (!d) return today;
  return formatDateInput(addDays(d, -1));
}

/**
 * Gasto/campanhas de um dia civil só ficam «fechados» quando foram gravados
 * **depois** desse dia (1.º sync após 00:00 no fuso da loja).
 * Se updatedAt cai no mesmo dateKey, foi sync intraday — valor parcial.
 */
export function isAdDayClosedAfterMidnight(
  dateKey: string,
  writtenAt: Date | string | null | undefined,
  storeTimeZone: string | null | undefined,
  today: string,
): boolean {
  if (!writtenAt) return false;
  if (dateKey >= today) return false;
  const tz = normalizeStoreTimezone(storeTimeZone);
  const writtenKey = dateKeyInTimezone(new Date(writtenAt), tz);
  return writtenKey > dateKey;
}

export type ApiSpendClosureInput = {
  dateKey: string;
  source?: string | null;
  amount?: number | null;
  updatedAt?: Date | string | null;
};

/** Dia com gasto API considerado fechado (não voltar a pedir spend). */
export function isApiSpendDayClosed(
  record: ApiSpendClosureInput | null | undefined,
  today: string,
  storeTimeZone: string | null | undefined,
): boolean {
  if (!record) return false;
  if (record.source === "manual") return true;
  if (record.source !== "api") return false;
  const amount = Number(record.amount ?? 0);
  if (amount <= 0) return false;
  return isAdDayClosedAfterMidnight(
    record.dateKey,
    record.updatedAt,
    storeTimeZone,
    today,
  );
}

/** Campanhas do dia fechadas (sync após meia-noite). */
export function isApiCampaignDayClosed(
  dateKey: string,
  maxSyncedAt: Date | string | null | undefined,
  today: string,
  storeTimeZone: string | null | undefined,
): boolean {
  if (!maxSyncedAt) return false;
  return isAdDayClosedAfterMidnight(
    dateKey,
    maxSyncedAt,
    storeTimeZone,
    today,
  );
}
