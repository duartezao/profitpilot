import "server-only";
import type { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import {
  dateKeyInTimezone,
  addDaysToDateKey,
  normalizeStoreTimezone,
  zonedStartOfDay,
  zonedEndOfDay,
  dayKeysBetweenInTimezone,
} from "@/lib/store-timezone";
import {
  addDays,
  formatDateInput,
  parseDateInput,
  startOfDay,
} from "@/lib/period";
import { fetchDailySessionMetricsFromShopify } from "@/lib/shopify-analytics";
import {
  sessionCountryKey,
  sessionCountryLabel,
} from "@/lib/shopify-countries";
import {
  dateKeyFromMonthDay,
  decodeMonthBlob,
  encodeMonthBlob,
  monthKeyFromDateKey,
  type DaySessionCounts,
} from "@/lib/session-metrics-codec";
import { SessionMetricsMonth } from "@/models/SessionMetricsMonth";
import { Store } from "@/models/Store";

export type SessionFunnelMetrics = {
  sessions: number;
  atcPct: number | null;
  checkoutPct: number | null;
  cvrPct: number | null;
  countryLabel: string;
  missingDays?: number;
  error?: string;
};

export type PeriodSlice = {
  start: Date;
  end: Date;
  specificDates?: string[];
};

export type SyncSessionMetricsResult = {
  synced: number;
  skipped: number;
};

function dayRangeKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let cur = startOfDay(from);
  const end = startOfDay(to);
  while (cur <= end) {
    keys.push(formatDateInput(cur));
    cur = addDays(cur, 1);
  }
  return keys;
}

function dayKeysInSlice(
  slice: PeriodSlice,
  timeZone?: string | null,
): string[] {
  if (slice.specificDates?.length) {
    return [...slice.specificDates].sort();
  }
  if (timeZone) {
    return dayKeysBetweenInTimezone(slice.start, slice.end, timeZone);
  }
  return dayRangeKeys(slice.start, slice.end);
}

function resolveSyncRange(
  importStartDate?: Date | null,
  storeCreatedAt?: Date | null,
  timeZone?: string | null,
): { from: Date; to: Date; fromKey: string; toKey: string } {
  const tz = normalizeStoreTimezone(timeZone);
  const todayKey = dateKeyInTimezone(new Date(), tz);
  const yesterdayKey = addDaysToDateKey(todayKey, -1, tz);

  let fromKey: string;
  if (importStartDate) {
    fromKey = formatDateInput(new Date(importStartDate));
  } else if (storeCreatedAt) {
    fromKey = formatDateInput(new Date(storeCreatedAt));
  } else {
    fromKey = addDaysToDateKey(todayKey, -60, tz);
  }

  if (fromKey > yesterdayKey) {
    fromKey = yesterdayKey;
  }

  const from = zonedStartOfDay(fromKey, tz);
  const to = zonedEndOfDay(yesterdayKey, tz);

  return {
    from,
    to,
    fromKey,
    toKey: yesterdayKey,
  };
}

function isHistoricalDay(
  dateKey: string,
  timeZone?: string | null,
  now = new Date(),
): boolean {
  const tz = normalizeStoreTimezone(timeZone);
  const todayKey = dateKeyInTimezone(now, tz);
  return dateKey < todayKey;
}

function groupContiguousRanges(
  keys: string[],
  timeZone?: string | null,
): Array<{ since: string; until: string }> {
  if (!keys.length) return [];
  const tz = normalizeStoreTimezone(timeZone);
  const sorted = [...keys].sort();
  const ranges: Array<{ since: string; until: string }> = [];
  let since = sorted[0];
  let until = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const nextDay = addDaysToDateKey(until, 1, tz);
    if (sorted[i] === nextDay) {
      until = sorted[i];
    } else {
      ranges.push({ since, until });
      since = sorted[i];
      until = sorted[i];
    }
  }
  ranges.push({ since, until });
  return ranges;
}

async function loadMonthDays(
  storeId: Types.ObjectId,
  countryKey: string,
  monthKeys: string[],
): Promise<Map<string, DaySessionCounts>> {
  const out = new Map<string, DaySessionCounts>();
  if (!monthKeys.length) return out;

  const docs = await SessionMetricsMonth.find({
    storeId,
    countryKey,
    monthKey: { $in: monthKeys },
  })
    .select("monthKey blob")
    .lean();

  for (const doc of docs) {
    const byDom = decodeMonthBlob(doc.blob as Buffer);
    for (const [dom, counts] of byDom) {
      out.set(dateKeyFromMonthDay(doc.monthKey, dom), counts);
    }
  }
  return out;
}

async function upsertDayRows(
  storeId: Types.ObjectId,
  countryKey: string,
  rows: Array<{ dateKey: string } & DaySessionCounts>,
): Promise<number> {
  if (!rows.length) return 0;

  const byMonth = new Map<string, typeof rows>();
  for (const row of rows) {
    const mk = monthKeyFromDateKey(row.dateKey);
    const list = byMonth.get(mk) ?? [];
    list.push(row);
    byMonth.set(mk, list);
  }

  let written = 0;
  for (const [monthKey, monthRows] of byMonth) {
    const existing = await SessionMetricsMonth.findOne({
      storeId,
      monthKey,
      countryKey,
    }).lean();

    const days = existing
      ? decodeMonthBlob(existing.blob as Buffer)
      : new Map<number, DaySessionCounts>();

    for (const row of monthRows) {
      const dom = Number(row.dateKey.slice(8, 10));
      if (dom < 1 || dom > 31) continue;
      days.set(dom, {
        sessions: row.sessions,
        cart: row.cart,
        checkout: row.checkout,
        completed: row.completed,
      });
      written++;
    }

    await SessionMetricsMonth.findOneAndUpdate(
      { storeId, monthKey, countryKey },
      {
        $set: {
          blob: encodeMonthBlob(days),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  return written;
}

function countsToFunnel(
  totals: DaySessionCounts,
  countryLabel: string,
  missingDays = 0,
): SessionFunnelMetrics {
  const { sessions, cart, checkout, completed } = totals;
  if (sessions <= 0) {
    return {
      sessions: 0,
      atcPct: null,
      checkoutPct: null,
      cvrPct: null,
      countryLabel,
      missingDays: missingDays || undefined,
    };
  }
  return {
    sessions,
    atcPct: (cart / sessions) * 100,
    checkoutPct: (checkout / sessions) * 100,
    cvrPct: (completed / sessions) * 100,
    countryLabel,
    missingDays: missingDays || undefined,
  };
}

function isAllZero(d: DaySessionCounts): boolean {
  return (
    d.sessions === 0 &&
    d.cart === 0 &&
    d.checkout === 0 &&
    d.completed === 0
  );
}

/**
 * Sincroniza dias em falta (e hoje) via ShopifyQL.
 * Dias históricos já guardados não voltam a ser pedidos.
 */
export async function syncSessionMetricsForStore(
  storeId: string,
): Promise<SyncSessionMetricsResult> {
  await connectToDatabase();
  const store = await Store.findById(storeId);
  if (!store || store.platform !== "shopify") {
    return { synced: 0, skipped: 0 };
  }

  const countryKey = sessionCountryKey(store.analyticsSessionCountry);
  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const range = resolveSyncRange(
    store.importStartDate,
    store.createdAt,
    tz,
  );
  const allKeys = dayKeysBetweenInTimezone(range.from, range.to, tz);

  const todayKey = dateKeyInTimezone(startOfDay(new Date()), tz);
  const keysToSync = [...allKeys];
  if (!keysToSync.includes(todayKey)) {
    keysToSync.push(todayKey);
  }

  const stored = await loadMonthDays(
    store._id,
    countryKey,
    [...new Set(keysToSync.map(monthKeyFromDateKey))],
  );

  const hadError = Boolean(store.lastSessionMetricsError);
  const missing = keysToSync.filter((k) => {
    const existing = stored.get(k);
    if (!existing) return true;
    if (!isHistoricalDay(k, tz)) return true;
    if (hadError && isAllZero(existing)) return true;
    return false;
  });

  if (!missing.length) {
    await Store.updateOne(
      { _id: store._id },
      { lastSessionMetricsAt: new Date(), lastSessionMetricsError: null },
    );
    return { synced: 0, skipped: keysToSync.length };
  }

  const ranges = groupContiguousRanges(missing, tz);
  let synced = 0;

  for (const { since, until } of ranges) {
    const rows = await fetchDailySessionMetricsFromShopify(store, since, until);
    const byKey = new Map(rows.map((r) => [r.dateKey, r]));
    const rangeMissing = missing.filter((k) => k >= since && k <= until);
    const toWrite = rangeMissing.map((dateKey) => {
      const hit = byKey.get(dateKey);
      if (hit) return hit;
      return {
        dateKey,
        sessions: 0,
        cart: 0,
        checkout: 0,
        completed: 0,
      };
    });
    synced += await upsertDayRows(store._id, countryKey, toWrite);
  }

  await Store.updateOne(
    { _id: store._id },
    { lastSessionMetricsAt: new Date(), lastSessionMetricsError: null },
  );

  return { synced, skipped: keysToSync.length - missing.length };
}

/** Agrega funil a partir da BD — sem pedidos à Shopify. */
export async function aggregateSessionFunnelFromDb(
  storeId: Types.ObjectId,
  countryShopifyName: string | null | undefined,
  slice: PeriodSlice,
  importFloorKey?: string | null,
  timeZone?: string | null,
): Promise<SessionFunnelMetrics> {
  const countryKey = sessionCountryKey(countryShopifyName);
  const countryLabel = sessionCountryLabel(countryShopifyName);
  const keys = dayKeysInSlice(slice, timeZone);
  const relevantKeys = importFloorKey
    ? keys.filter((k) => k >= importFloorKey)
    : keys;
  const monthKeys = [...new Set(keys.map(monthKeyFromDateKey))];
  const stored = await loadMonthDays(storeId, countryKey, monthKeys);

  const totals: DaySessionCounts = {
    sessions: 0,
    cart: 0,
    checkout: 0,
    completed: 0,
  };
  let found = 0;

  for (const key of relevantKeys) {
    const d = stored.get(key);
    if (!d) continue;
    found++;
    totals.sessions += d.sessions;
    totals.cart += d.cart;
    totals.checkout += d.checkout;
    totals.completed += d.completed;
  }

  const missingDays = relevantKeys.length - found;
  const base = countsToFunnel(totals, countryLabel, missingDays);

  if (missingDays > 0 && totals.sessions === 0) {
    return {
      ...base,
      error: `Sessões ainda não sincronizadas (${missingDays} dia${missingDays === 1 ? "" : "s"}). O sync automático (4 h) preenche em breve.`,
    };
  }

  if (missingDays > 0) {
    return {
      ...base,
      error: `Dados parciais — faltam ${missingDays} dia${missingDays === 1 ? "" : "s"} (serão pedidos no próximo sync).`,
    };
  }

  return base;
}

/** Sessões/funil por dia (BD) — usado na tabela diária de /metricas. */
export async function loadDailySessionCountsForSlice(
  storeId: Types.ObjectId,
  countryShopifyName: string | null | undefined,
  slice: PeriodSlice,
  timeZone?: string | null,
): Promise<Map<string, DaySessionCounts>> {
  const countryKey = sessionCountryKey(countryShopifyName);
  const keys = dayKeysInSlice(slice, timeZone);
  const monthKeys = [...new Set(keys.map(monthKeyFromDateKey))];
  const stored = await loadMonthDays(storeId, countryKey, monthKeys);
  const out = new Map<string, DaySessionCounts>();
  for (const key of keys) {
    const d = stored.get(key);
    if (d) out.set(key, d);
  }
  return out;
}
