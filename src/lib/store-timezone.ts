/**
 * Dias civis e períodos alinhados com o fuso IANA da loja Shopify
 * (ex. Europe/Brussels) — igual ao admin da Shopify.
 */
import {
  PERIOD_PRESETS,
  addDays,
  formatDateInput,
  formatRangeLabel,
  parseDateInput,
  rollingPrevious,
  type PeriodInput,
  type PeriodPresetId,
  type ResolvedPeriod,
} from "@/lib/period";

export const DEFAULT_STORE_TIMEZONE = "Europe/Lisbon";

const MAX_CUSTOM_DAYS = 366;
const MAX_SPECIFIC_DATES = 31;

export function normalizeStoreTimezone(tz?: string | null): string {
  if (!tz?.trim()) return DEFAULT_STORE_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return tz.trim();
  } catch {
    return DEFAULT_STORE_TIMEZONE;
  }
}

/** YYYY-MM-DD do instante no fuso da loja. */
export function dateKeyInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function tzOffsetMs(utc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(utc);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second")),
  );
  return asUtc - utc.getTime();
}

/** Início do dia civil (instante UTC) no fuso da loja. */
export function zonedStartOfDay(dateKey: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  return new Date(utcMidnight.getTime() - tzOffsetMs(utcMidnight, timeZone));
}

/** Fim do dia civil (23:59:59.999) no fuso da loja. */
export function zonedEndOfDay(dateKey: string, timeZone: string): Date {
  const nextKey = addDaysToDateKey(dateKey, 1, timeZone);
  return new Date(zonedStartOfDay(nextKey, timeZone).getTime() - 1);
}

/** Soma dias a uma chave YYYY-MM-DD no fuso da loja (seguro com DST). */
export function addDaysToDateKey(
  dateKey: string,
  days: number,
  timeZone: string,
): string {
  const noon = new Date(
    zonedStartOfDay(dateKey, timeZone).getTime() + 12 * 60 * 60 * 1000,
  );
  return dateKeyInTimezone(addDays(noon, days), timeZone);
}

export function dayKeysBetweenInTimezone(
  start: Date,
  end: Date,
  timeZone: string,
): string[] {
  let cur = dateKeyInTimezone(start, timeZone);
  const endKey = dateKeyInTimezone(end, timeZone);
  const keys: string[] = [];
  while (cur <= endKey) {
    keys.push(cur);
    if (cur === endKey) break;
    cur = addDaysToDateKey(cur, 1, timeZone);
  }
  return keys;
}

function boundsFromKeys(
  startKey: string,
  endKey: string,
  timeZone: string,
): { start: Date; end: Date } {
  return {
    start: zonedStartOfDay(startKey, timeZone),
    end: zonedEndOfDay(endKey, timeZone),
  };
}

function presetRangeInTimezone(
  id: PeriodPresetId,
  timeZone: string,
  now = new Date(),
): ResolvedPeriod {
  const todayKey = dateKeyInTimezone(now, timeZone);
  let startKey: string;
  let endKey: string;
  let prevStartKey: string;
  let prevEndKey: string;

  switch (id) {
    case "today":
      startKey = todayKey;
      endKey = todayKey;
      prevStartKey = addDaysToDateKey(todayKey, -1, timeZone);
      prevEndKey = prevStartKey;
      break;
    case "yesterday":
      startKey = addDaysToDateKey(todayKey, -1, timeZone);
      endKey = startKey;
      prevStartKey = addDaysToDateKey(todayKey, -2, timeZone);
      prevEndKey = prevStartKey;
      break;
    case "5d":
      endKey = todayKey;
      startKey = addDaysToDateKey(todayKey, -4, timeZone);
      prevEndKey = addDaysToDateKey(startKey, -1, timeZone);
      prevStartKey = addDaysToDateKey(prevEndKey, -4, timeZone);
      break;
    case "7d":
      endKey = todayKey;
      startKey = addDaysToDateKey(todayKey, -6, timeZone);
      prevEndKey = addDaysToDateKey(startKey, -1, timeZone);
      prevStartKey = addDaysToDateKey(prevEndKey, -6, timeZone);
      break;
    case "30d":
      endKey = todayKey;
      startKey = addDaysToDateKey(todayKey, -29, timeZone);
      prevEndKey = addDaysToDateKey(startKey, -1, timeZone);
      prevStartKey = addDaysToDateKey(prevEndKey, -29, timeZone);
      break;
    case "month": {
      const [y, m] = todayKey.split("-").map(Number);
      startKey = `${y}-${String(m).padStart(2, "0")}-01`;
      endKey = todayKey;
      const prevMonth = m === 1 ? 12 : m - 1;
      const prevYear = m === 1 ? y - 1 : y;
      prevStartKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
      const day = Number(todayKey.split("-")[2]);
      const lastPrev = new Date(prevYear, prevMonth, 0).getDate();
      prevEndKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(Math.min(day, lastPrev)).padStart(2, "0")}`;
      break;
    }
    case "90d":
      endKey = todayKey;
      startKey = addDaysToDateKey(todayKey, -89, timeZone);
      prevEndKey = addDaysToDateKey(startKey, -1, timeZone);
      prevStartKey = addDaysToDateKey(prevEndKey, -89, timeZone);
      break;
    case "ytd": {
      const y = Number(todayKey.split("-")[0]);
      startKey = `${y}-01-01`;
      endKey = todayKey;
      prevStartKey = `${y - 1}-01-01`;
      prevEndKey = addDaysToDateKey(todayKey, -365, timeZone);
      break;
    }
    case "365d":
      endKey = todayKey;
      startKey = addDaysToDateKey(todayKey, -364, timeZone);
      prevEndKey = addDaysToDateKey(startKey, -1, timeZone);
      prevStartKey = addDaysToDateKey(prevEndKey, -364, timeZone);
      break;
    default:
      endKey = todayKey;
      startKey = addDaysToDateKey(todayKey, -29, timeZone);
      prevEndKey = addDaysToDateKey(startKey, -1, timeZone);
      prevStartKey = addDaysToDateKey(prevEndKey, -29, timeZone);
  }

  const { start, end } = boundsFromKeys(startKey, endKey, timeZone);
  const prevStart = zonedStartOfDay(prevStartKey, timeZone);
  const prevEnd = zonedEndOfDay(prevEndKey, timeZone);

  return {
    preset: id,
    start,
    end,
    label: formatRangeLabel(start, end),
    prevStart,
    prevEnd,
    prevLabel: formatRangeLabel(prevStart, prevEnd),
    key: `${id}@${timeZone}`,
  };
}

function customRangeInTimezone(
  from: string,
  to: string,
  timeZone: string,
): ResolvedPeriod | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return null;
  }
  if (from > to) return null;

  const days =
    dayKeysBetweenInTimezone(
      zonedStartOfDay(from, timeZone),
      zonedEndOfDay(to, timeZone),
      timeZone,
    ).length;
  if (days > MAX_CUSTOM_DAYS) return null;

  const start = zonedStartOfDay(from, timeZone);
  const end = zonedEndOfDay(to, timeZone);
  const { prevStart, prevEnd } = rollingPrevious(start, end);

  return {
    preset: "custom",
    start,
    end,
    label: formatRangeLabel(start, end),
    prevStart,
    prevEnd,
    prevLabel: formatRangeLabel(prevStart, prevEnd),
    key: `custom:${from}:${to}@${timeZone}`,
  };
}

function parseDatesList(raw: string): string[] | null {
  const dates = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
    ),
  ].sort();
  if (!dates.length || dates.length > MAX_SPECIFIC_DATES) return null;
  return dates;
}

function specificDatesRangeInTimezone(
  dates: string[],
  timeZone: string,
): ResolvedPeriod | null {
  const start = zonedStartOfDay(dates[0], timeZone);
  const end = zonedEndOfDay(dates[dates.length - 1], timeZone);
  const prevSpecificDates = dates.map((d) =>
    addDaysToDateKey(d, -7, timeZone),
  );

  return {
    preset: "dates",
    start,
    end,
    specificDates: dates,
    prevSpecificDates,
    label: `${dates.length} dias`,
    prevStart: zonedStartOfDay(prevSpecificDates[0], timeZone),
    prevEnd: zonedEndOfDay(
      prevSpecificDates[prevSpecificDates.length - 1],
      timeZone,
    ),
    prevLabel: `${dates.length} dias (−7)`,
    key: `dates:${dates.join(",")}@${timeZone}`,
  };
}

/** Período da topbar no fuso da loja (ontem/hoje = dia civil Shopify). */
export function resolvePeriodForStore(
  input: PeriodInput = {},
  timeZone: string,
  now = new Date(),
): ResolvedPeriod {
  const tz = normalizeStoreTimezone(timeZone);

  const datesRaw = input.dates?.trim();
  if (datesRaw) {
    const dates = parseDatesList(datesRaw);
    if (dates) {
      const resolved = specificDatesRangeInTimezone(dates, tz);
      if (resolved) return resolved;
    }
  }

  const from = input.from?.trim();
  const to = input.to?.trim();
  if (from && to) {
    const custom = customRangeInTimezone(from, to, tz);
    if (custom) return custom;
  }

  const raw = input.period?.trim() || "30d";
  const preset =
    PERIOD_PRESETS.find((p) => p.id === raw)?.id ?? ("30d" as PeriodPresetId);
  return presetRangeInTimezone(preset, tz, now);
}

/** Filtro MongoDB por `orderDate` com limites no fuso da loja. */
export function orderDateMatchInTimezone(
  period: Pick<ResolvedPeriod, "start" | "end" | "specificDates">,
  timeZone: string,
): Record<string, unknown> {
  const tz = normalizeStoreTimezone(timeZone);
  if (period.specificDates?.length) {
    return {
      $or: period.specificDates.map((dateStr) => ({
        orderDate: {
          $gte: zonedStartOfDay(dateStr, tz),
          $lte: zonedEndOfDay(dateStr, tz),
        },
      })),
    };
  }
  return { orderDate: { $gte: period.start, $lte: period.end } };
}

/** Chave YYYY-MM-DD da data de importação (dia civil no fuso da loja, se indicado). */
export function importDateKey(
  importStartDate?: Date | null,
  storeCreatedAt?: Date | null,
  timeZone?: string | null,
): string | null {
  const d = importStartDate ?? storeCreatedAt;
  if (!d) return null;
  if (timeZone) {
    return dateKeyInTimezone(new Date(d), normalizeStoreTimezone(timeZone));
  }
  return formatDateInput(new Date(d));
}
