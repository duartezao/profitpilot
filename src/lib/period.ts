/**
 * Períodos do dashboard — partilhado entre cliente e servidor.
 * URL: `?period=30d` | `?from=&to=` | `?dates=YYYY-MM-DD,YYYY-MM-DD`
 */

export const PERIOD_PRESETS = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "month", label: "Este mês" },
  { id: "90d", label: "Últimos 3 meses" },
  { id: "ytd", label: "Este ano" },
  { id: "365d", label: "Últimos 12 meses" },
] as const;

export type PeriodPresetId = (typeof PERIOD_PRESETS)[number]["id"];

export type PeriodInput = {
  period?: string | null;
  from?: string | null;
  to?: string | null;
  /** Dias exatos separados por vírgula (não contíguos). */
  dates?: string | null;
};

export type PeriodKind = PeriodPresetId | "custom" | "dates";

export type ResolvedPeriod = {
  preset: PeriodKind;
  start: Date;
  end: Date;
  label: string;
  prevStart: Date;
  prevEnd: Date;
  prevLabel: string;
  /** Dias exatos quando `preset === "dates"`. */
  specificDates?: string[];
  /** Período anterior (mesmos dias −7) para comparação. */
  prevSpecificDates?: string[];
  /** Chave estável para queryKey / cache. */
  key: string;
};

const DEFAULT_PRESET: PeriodPresetId = "30d";
const MAX_CUSTOM_DAYS = 366;
export const MAX_SPECIFIC_DATES = 31;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function startOfYear(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), 0, 1));
}

function formatDay(d: Date, withYear = false): string {
  return d.toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function formatRangeLabel(start: Date, end: Date): string {
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) return formatDay(start, true);
  const crossYear = start.getFullYear() !== end.getFullYear();
  return `${formatDay(start, crossYear)} – ${formatDay(end, true)}`;
}

export function rollingPrevious(start: Date, end: Date): { prevStart: Date; prevEnd: Date } {
  const duration = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);
  return { prevStart, prevEnd };
}

function presetRange(id: PeriodPresetId, now = new Date()): ResolvedPeriod {
  let start: Date;
  let end: Date;
  let prevStart: Date;
  let prevEnd: Date;

  switch (id) {
    case "today":
      start = startOfDay(now);
      end = endOfDay(now);
      prevStart = startOfDay(addDays(now, -1));
      prevEnd = endOfDay(addDays(now, -1));
      break;
    case "yesterday":
      start = startOfDay(addDays(now, -1));
      end = endOfDay(addDays(now, -1));
      prevStart = startOfDay(addDays(now, -2));
      prevEnd = endOfDay(addDays(now, -2));
      break;
    case "7d":
      end = endOfDay(now);
      start = startOfDay(addDays(now, -6));
      ({ prevStart, prevEnd } = rollingPrevious(start, end));
      break;
    case "30d":
      end = endOfDay(now);
      start = startOfDay(addDays(now, -29));
      ({ prevStart, prevEnd } = rollingPrevious(start, end));
      break;
    case "month":
      start = startOfMonth(now);
      end = endOfDay(now);
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevStart = startOfMonth(prevMonth);
      const day = now.getDate();
      const lastDayPrev = endOfMonth(prevMonth).getDate();
      prevEnd = endOfDay(
        new Date(prevMonth.getFullYear(), prevMonth.getMonth(), Math.min(day, lastDayPrev)),
      );
      break;
    case "90d":
      end = endOfDay(now);
      start = startOfDay(addDays(now, -89));
      ({ prevStart, prevEnd } = rollingPrevious(start, end));
      break;
    case "ytd":
      start = startOfYear(now);
      end = endOfDay(now);
      const lastYear = new Date(
        now.getFullYear() - 1,
        now.getMonth(),
        now.getDate(),
      );
      prevStart = startOfYear(lastYear);
      prevEnd = endOfDay(lastYear);
      break;
    case "365d":
      end = endOfDay(now);
      start = startOfDay(addDays(now, -364));
      ({ prevStart, prevEnd } = rollingPrevious(start, end));
      break;
    default:
      end = endOfDay(now);
      start = startOfDay(addDays(now, -29));
      ({ prevStart, prevEnd } = rollingPrevious(start, end));
  }

  return {
    preset: id,
    start,
    end,
    label: formatRangeLabel(start, end),
    prevStart,
    prevEnd,
    prevLabel: formatRangeLabel(prevStart, prevEnd),
    key: id,
  };
}

export function parseDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

/** YYYY-MM-DD a partir de Date local. */
export function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDatesList(raw: string): string[] | null {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > MAX_SPECIFIC_DATES) return null;

  const unique = [...new Set(parts)].sort();
  for (const p of unique) {
    if (!parseDateInput(p)) return null;
  }
  return unique;
}

function specificDatesLabel(dates: string[]): string {
  if (dates.length === 1) {
    return formatDay(parseDateInput(dates[0])!, true);
  }
  const first = parseDateInput(dates[0])!;
  const last = parseDateInput(dates[dates.length - 1])!;
  const crossYear = first.getFullYear() !== last.getFullYear();
  return `${dates.length} dias · ${formatDay(first, crossYear)} – ${formatDay(last, true)}`;
}

function specificDatesRange(dates: string[]): ResolvedPeriod | null {
  const parsed = dates.map((d) => parseDateInput(d)!);
  const start = startOfDay(parsed[0]);
  const end = endOfDay(parsed[parsed.length - 1]);

  const prevSpecificDates = dates.map((d) =>
    formatDateInput(addDays(parseDateInput(d)!, -7)),
  );
  const prevParsed = prevSpecificDates.map((d) => parseDateInput(d)!);
  const prevStart = startOfDay(prevParsed[0]);
  const prevEnd = endOfDay(prevParsed[prevParsed.length - 1]);

  return {
    preset: "dates",
    specificDates: dates,
    prevSpecificDates,
    start,
    end,
    label: specificDatesLabel(dates),
    prevStart,
    prevEnd,
    prevLabel: specificDatesLabel(prevSpecificDates),
    key: `dates:${dates.join(",")}`,
  };
}

/** Filtro MongoDB para um campo Date consoante o período. */
export function dateFieldMatch(
  field: string,
  period: Pick<ResolvedPeriod, "start" | "end" | "specificDates">,
): Record<string, unknown> {
  if (period.specificDates?.length) {
    return {
      $or: period.specificDates.map((dateStr) => {
        const d = parseDateInput(dateStr)!;
        return {
          [field]: { $gte: startOfDay(d), $lte: endOfDay(d) },
        };
      }),
    };
  }
  return { [field]: { $gte: period.start, $lte: period.end } };
}

/** Filtro MongoDB para `orderDate` consoante o período. */
export function orderDateMatch(
  period: Pick<ResolvedPeriod, "start" | "end" | "specificDates">,
): Record<string, unknown> {
  return dateFieldMatch("orderDate", period);
}

export function periodDayCount(period: ResolvedPeriod): number {
  if (period.specificDates?.length) return period.specificDates.length;
  return (
    Math.floor(
      (period.end.getTime() - period.start.getTime()) / (24 * 60 * 60 * 1000),
    ) + 1
  );
}

export function periodIsSingleDay(period: ResolvedPeriod): boolean {
  if (period.specificDates?.length === 1) return true;
  return period.start.toDateString() === period.end.toDateString();
}

/** Máximo de dias agregados em campanhas (evita queries enormes). */
export const MAX_CAMPAIGN_PERIOD_DAYS = 31;

/** Lista de dateKeys (YYYY-MM-DD) para um período resolvido. */
export function dateKeysFromResolvedPeriod(
  period: ResolvedPeriod,
  maxDays = MAX_CAMPAIGN_PERIOD_DAYS,
): string[] {
  let keys: string[];
  if (period.specificDates?.length) {
    keys = [...period.specificDates].sort();
  } else {
    keys = [];
    let cur = startOfDay(period.start);
    const end = startOfDay(period.end);
    while (cur <= end) {
      keys.push(formatDateInput(cur));
      cur = addDays(cur, 1);
    }
  }
  if (keys.length > maxDays) {
    return keys.slice(-maxDays);
  }
  return keys;
}

/** O período inclui o dia de hoje (servidor local)? */
export function periodIncludesToday(
  period: ResolvedPeriod,
  todayKey = formatDateInput(new Date()),
): boolean {
  if (period.specificDates?.length) {
    return period.specificDates.includes(todayKey);
  }
  const startKey = formatDateInput(period.start);
  const endKey = formatDateInput(period.end);
  return todayKey >= startKey && todayKey <= endKey;
}

function customRange(from: string, to: string): ResolvedPeriod | null {
  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to);
  if (!fromDate || !toDate) return null;

  const start = startOfDay(fromDate);
  const end = endOfDay(toDate);
  if (start > end) return null;

  const days =
    Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (days > MAX_CUSTOM_DAYS) return null;

  const { prevStart, prevEnd } = rollingPrevious(start, end);

  return {
    preset: "custom",
    start,
    end,
    label: formatRangeLabel(start, end),
    prevStart,
    prevEnd,
    prevLabel: formatRangeLabel(prevStart, prevEnd),
    key: `custom:${from}:${to}`,
  };
}

export function resolvePeriod(input: PeriodInput = {}): ResolvedPeriod {
  const datesRaw = input.dates?.trim();
  if (datesRaw) {
    const dates = parseDatesList(datesRaw);
    if (dates) {
      const resolved = specificDatesRange(dates);
      if (resolved) return resolved;
    }
  }

  const from = input.from?.trim();
  const to = input.to?.trim();

  if (from && to) {
    const custom = customRange(from, to);
    if (custom) return custom;
  }

  const raw = input.period?.trim() || DEFAULT_PRESET;
  const preset = PERIOD_PRESETS.find((p) => p.id === raw)?.id ?? DEFAULT_PRESET;
  return presetRange(preset);
}

export function periodFromSearchParams(
  params: URLSearchParams | PeriodInput,
): ResolvedPeriod {
  if (params instanceof URLSearchParams) {
    return resolvePeriod({
      period: params.get("period"),
      from: params.get("from"),
      to: params.get("to"),
      dates: params.get("dates"),
    });
  }
  return resolvePeriod(params);
}

/** Parâmetros de período para APIs (sem `store`). */
export function periodQueryFromSearchParams(params: URLSearchParams): string {
  const from = params.get("from");
  const to = params.get("to");
  const dates = params.get("dates");
  const period = params.get("period");
  const q = new URLSearchParams();
  if (dates) {
    q.set("dates", dates);
  } else if (from && to) {
    q.set("from", from);
    q.set("to", to);
  } else if (period) {
    q.set("period", period);
  } else {
    q.set("period", DEFAULT_PRESET);
  }
  return q.toString();
}

export function appendPeriodToUrl(
  basePath: string,
  params: URLSearchParams,
): string {
  const q = new URLSearchParams(params.toString());
  const periodQs = periodQueryFromSearchParams(q);
  const merged = new URLSearchParams(periodQs);
  for (const key of ["store"] as const) {
    const v = params.get(key);
    if (v) merged.set(key, v);
  }
  const qs = merged.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function shortPeriodLabel(period: ResolvedPeriod): string {
  if (period.preset === "dates") {
    if (period.specificDates?.length === 1) {
      return formatDay(parseDateInput(period.specificDates[0])!, true);
    }
    return `${period.specificDates?.length ?? 0} dias`;
  }
  if (period.preset === "custom") {
    if (periodIsSingleDay(period)) {
      return formatDay(period.start, true);
    }
    return `${periodDayCount(period)} dias`;
  }
  const preset = PERIOD_PRESETS.find((p) => p.id === period.preset);
  if (preset?.id === "7d") return "7 dias";
  if (preset?.id === "30d") return "30 dias";
  if (preset?.id === "90d") return "3 meses";
  if (preset?.id === "365d") return "12 meses";
  return preset?.label ?? period.label;
}

export type ActivePeriodMode = PeriodPresetId | "custom" | "dates";

export function activePeriodMode(params: URLSearchParams): ActivePeriodMode {
  const dates = params.get("dates");
  if (dates?.trim()) return "dates";
  const from = params.get("from");
  const to = params.get("to");
  if (from && to) return "custom";
  const p = params.get("period");
  if (p && PERIOD_PRESETS.some((x) => x.id === p)) return p as PeriodPresetId;
  return DEFAULT_PRESET;
}

/** @deprecated Use activePeriodMode */
export function activePresetId(params: URLSearchParams): ActivePeriodMode {
  return activePeriodMode(params);
}

/** Piso de dias válidos: data de importação (setup) ou criação da loja. */
export function resolveImportFloor(
  importStartDate?: Date | null,
  storeCreatedAt?: Date | null,
): Date | null {
  if (importStartDate) return startOfDay(new Date(importStartDate));
  if (storeCreatedAt) return startOfDay(new Date(storeCreatedAt));
  return null;
}

export type DateRangeSlice = {
  start: Date;
  end: Date;
  specificDates?: string[];
};

/** Corta o período para não incluir dias anteriores à importação. */
export function clampSliceToImportFloor(
  slice: DateRangeSlice,
  importFloor: Date | null,
): DateRangeSlice {
  if (!importFloor) return slice;
  const floorKey = formatDateInput(importFloor);

  if (slice.specificDates !== undefined) {
    return {
      ...slice,
      specificDates: slice.specificDates.filter((d) => d >= floorKey),
    };
  }

  const clampedStart =
    startOfDay(slice.start) < importFloor ? importFloor : slice.start;
  if (startOfDay(clampedStart) > startOfDay(slice.end)) {
    return { ...slice, specificDates: [] };
  }
  return { ...slice, start: clampedStart };
}

export function earliestImportFloor(
  stores: Array<{ importStartDate?: Date | null; createdAt?: Date }>,
): Date | null {
  let earliest: Date | null = null;
  for (const s of stores) {
    const floor = resolveImportFloor(s.importStartDate, s.createdAt);
    if (floor && (!earliest || floor < earliest)) earliest = floor;
  }
  return earliest;
}

export function formatImportSinceLabel(floor: Date | null): string | null {
  if (!floor) return null;
  return floor.toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
