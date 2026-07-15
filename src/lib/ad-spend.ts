import "server-only";
import type { Types } from "mongoose";
import type { CurrentUser } from "@/lib/auth";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { Order } from "@/models/Order";
import {
  addDays,
  formatDateInput,
  parseDateInput,
  startOfDay,
  endOfDay,
} from "@/lib/period";
import type { AdSpendLineStored } from "@/lib/ad-spend-platforms";
import { AD_PLATFORM_LABELS, adSpendLineTotalBase } from "@/lib/ad-spend-platforms";
import { isAdSpendDayLockedForApiForStore } from "@/lib/ad-spend-lock";
import { isApiSpendDayClosed } from "@/lib/ad-spend-complete";
import {
  dateKeyInTimezone,
  dayKeysBetweenInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import { canAccessStore } from "@/lib/store-access";

export const AD_SPEND_LOOKBACK_DAYS = 60;

export type AdSpendRange = {
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
};

/** Intervalo de dias a preencher: desde a data de importação (setup) até ontem. */
export function resolveAdSpendRange(
  importStartDate?: Date | null,
  storeCreatedAt?: Date | null,
): AdSpendRange {
  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);

  let from: Date;
  if (importStartDate) {
    from = startOfDay(new Date(importStartDate));
  } else if (storeCreatedAt) {
    from = startOfDay(new Date(storeCreatedAt));
  } else {
    from = addDays(today, -AD_SPEND_LOOKBACK_DAYS);
  }

  if (from > yesterday) {
    from = yesterday;
  }

  return {
    from,
    to: yesterday,
    fromKey: formatDateInput(from),
    toKey: formatDateInput(yesterday),
  };
}

export type PeriodSlice = {
  start: Date;
  end: Date;
  specificDates?: string[];
};

export type AdSpendLineView = AdSpendLineStored & {
  platformLabel: string;
  totalBase: number;
};

export type AdSpendDayRow = {
  dateKey: string;
  label: string;
  /** Valor na moeda base (EUR) — só ads, sem fees. */
  amount: number | null;
  inputAmount: number | null;
  inputCurrency: string | null;
  fxRate: number | null;
  extraFee: number | null;
  inputExtraFee: number | null;
  /** amount + extraFee (inclui fees fixas e % agência). */
  totalAmount: number | null;
  lines: AdSpendLineView[];
  baseCurrency: string;
  hasOrders: boolean;
  isYesterday: boolean;
  /** Fechado — sync API não volta a escrever (ontem e anteriores). */
  isLocked: boolean;
  /** Gasto API gravado após 00:00 do dia seguinte (dia completo). */
  isApiClosed: boolean;
  /** Sync intraday no mesmo dia civil — valor pode estar incompleto. */
  isPartialApi: boolean;
  source: "manual" | "api" | null;
  note?: string;
  /** ISO timestamp para detecção de conflitos (optimistic locking). */
  revisionAt: string | null;
  /** ISO timestamp do último registo (para UI). */
  updatedAt: string | null;
};

export type StoreAdSpendSummary = {
  storeId: string;
  storeName: string;
  missingCount: number;
  yesterdayMissing: boolean;
};

function adSpendDateMatch(
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Record<string, unknown> {
  if (slice.specificDates?.length) {
    return { dateKey: { $in: slice.specificDates } };
  }
  if (storeTimeZone) {
    const keys = dayKeysBetweenInTimezone(
      slice.start,
      slice.end,
      storeTimeZone,
    );
    if (!keys.length) return { dateKey: { $in: [] } };
    return { dateKey: { $gte: keys[0], $lte: keys[keys.length - 1] } };
  }
  return {
    dateKey: {
      $gte: formatDateInput(slice.start),
      $lte: formatDateInput(slice.end),
    },
  };
}

function formatDayLabel(dateKey: string): string {
  const d = parseDateInput(dateKey);
  if (!d) return dateKey;
  return d.toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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

/** Dias com registo manual de ad spend no período (por loja). */
export async function countAdSpendEntriesByStore(
  storeIds: Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<Map<string, number>> {
  if (!storeIds.length) return new Map();

  const rows = await ManualAdSpend.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        storeId: { $in: storeIds },
        ...adSpendDateMatch(slice, storeTimeZone),
      },
    },
    { $group: { _id: "$storeId", count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((r) => [String(r._id), r.count]));
}

/** Total de dias com registo manual de ad spend no período. */
export async function countAdSpendEntriesInPeriod(
  storeIds: Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<number> {
  const byStore = await countAdSpendEntriesByStore(
    storeIds,
    slice,
    storeTimeZone,
  );
  return [...byStore.values()].reduce((s, n) => s + n, 0);
}

/** Soma ad spend manual de uma ou várias lojas num período. */
export async function sumAdSpendForPeriod(
  storeIds: Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<number> {
  if (!storeIds.length) return 0;

  const rows = await ManualAdSpend.aggregate<{ total: number }>([
    {
      $match: {
        storeId: { $in: storeIds },
        ...adSpendDateMatch(slice, storeTimeZone),
      },
    },
    { $group: { _id: null, total: { $sum: { $add: ["$amount", { $ifNull: ["$extraFee", 0] }] } } } },
  ]);

  return rows[0]?.total ?? 0;
}

export type AdSpendStoreRef = {
  _id: Types.ObjectId;
  ianaTimezone?: string | null;
};

/** Soma e contagens por loja, cada uma no seu fuso horário. */
export async function aggregateAdSpendForStores(
  stores: AdSpendStoreRef[],
  slice: PeriodSlice,
): Promise<{
  total: number;
  byStore: Map<string, number>;
  entriesByStore: Map<string, number>;
}> {
  const byStore = new Map<string, number>();
  const entriesByStore = new Map<string, number>();

  await Promise.all(
    stores.map(async (s) => {
      const sid = String(s._id);
      const tz = normalizeStoreTimezone(s.ianaTimezone);
      const [sum, entries] = await Promise.all([
        sumAdSpendForPeriod([s._id], slice, tz),
        countAdSpendEntriesByStore([s._id], slice, tz),
      ]);
      byStore.set(sid, sum);
      entriesByStore.set(sid, entries.get(sid) ?? 0);
    }),
  );

  const total = [...byStore.values()].reduce((a, b) => a + b, 0);
  return { total, byStore, entriesByStore };
}

/** Dias com encomendas (para destacar dias com vendas sem ad spend). */
async function orderDaysInRange(
  storeId: Types.ObjectId,
  from: Date,
  to: Date,
): Promise<Set<string>> {
  const rows = await Order.aggregate<{ _id: string }>([
    {
      $match: {
        storeId,
        orderDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$orderDate" },
        },
      },
    },
  ]);
  return new Set(rows.map((r) => r._id));
}

/** Calendário de ad spend: dias preenchidos e em falta (importação → ontem). */
export async function buildAdSpendCalendar(
  storeId: Types.ObjectId,
  baseCurrency = "EUR",
  importStartDate?: Date | null,
  storeCreatedAt?: Date | null,
  storeTimeZone?: string | null,
): Promise<AdSpendDayRow[]> {
  const tz = normalizeStoreTimezone(storeTimeZone);
  const todayKey = dateKeyInTimezone(new Date(), tz);
  const { from, to: yesterday } = resolveAdSpendRange(
    importStartDate,
    storeCreatedAt,
  );

  const dateKeys = dayRangeKeys(from, yesterday);
  if (!dateKeys.length) return [];
  const [entries, orderDays] = await Promise.all([
    ManualAdSpend.find({
      storeId,
      dateKey: { $in: dateKeys },
    })
      .select(
        "dateKey amount inputAmount inputCurrency fxRate extraFee inputExtraFee lines note currency source updatedAt",
      )
      .lean(),
    orderDaysInRange(storeId, from, yesterday),
  ]);

  const byKey = new Map(
    entries.map((e) => {
      const rawLines = (e.lines ?? []) as AdSpendLineStored[];
      const lines: AdSpendLineView[] =
        rawLines.length > 0
          ? rawLines.map((l) => ({
              ...l,
              platformLabel: AD_PLATFORM_LABELS[l.platform] ?? l.platform,
              totalBase: adSpendLineTotalBase(l),
            }))
          : e.amount != null
            ? [
                {
                  platform: "meta" as const,
                  inputAmount: e.inputAmount ?? Number(e.amount),
                  inputCurrency: e.inputCurrency ?? e.currency ?? baseCurrency,
                  amount: Number(e.amount),
                  fxRate: e.fxRate ?? null,
                  extraFee: Number(e.extraFee ?? 0),
                  inputExtraFee: e.inputExtraFee ?? null,
                  agencyFeePercent: 0,
                  agencyFeeAmount: 0,
                  inputAgencyFeeAmount: null,
                  platformLabel: "Total (legado)",
                  totalBase:
                    Number(e.amount) + Number(e.extraFee ?? 0),
                },
              ]
            : [];

      return [
        e.dateKey,
        {
          amount: e.amount,
          inputAmount: e.inputAmount,
          inputCurrency: e.inputCurrency,
          fxRate: e.fxRate,
          extraFee: e.extraFee,
          inputExtraFee: e.inputExtraFee,
          lines,
          note: e.note ?? "",
          source: e.source as "manual" | "api" | undefined,
          revisionAt: e.updatedAt
            ? new Date(e.updatedAt).toISOString()
            : null,
          updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : null,
        },
      ];
    }),
  );
  const yesterdayKey = formatDateInput(yesterday);

  return dateKeys
    .slice()
    .reverse()
    .map((dateKey) => {
      const entry = byKey.get(dateKey);
      const amount = entry != null ? Number(entry.amount) : null;
      const extraFee =
        entry?.extraFee != null ? Number(entry.extraFee) : null;
      const source = (entry?.source as "manual" | "api" | undefined) ?? null;
      const apiClosed =
        source === "api" &&
        isApiSpendDayClosed(
          {
            dateKey,
            source,
            amount,
            updatedAt: entry?.updatedAt ?? null,
          },
          todayKey,
          tz,
        );
      const partialApi =
        source === "api" &&
        amount != null &&
        dateKey < todayKey &&
        !apiClosed;
      return {
        dateKey,
        label: formatDayLabel(dateKey),
        amount,
        inputAmount:
          entry?.inputAmount != null ? Number(entry.inputAmount) : null,
        inputCurrency: entry?.inputCurrency ?? null,
        fxRate: entry?.fxRate != null ? Number(entry.fxRate) : null,
        extraFee,
        inputExtraFee:
          entry?.inputExtraFee != null ? Number(entry.inputExtraFee) : null,
        totalAmount:
          amount != null ? amount + (extraFee ?? 0) : null,
        lines: entry?.lines ?? [],
        baseCurrency,
        hasOrders: orderDays.has(dateKey),
        isYesterday: dateKey === yesterdayKey,
        isLocked: isAdSpendDayLockedForApiForStore(dateKey, tz),
        isApiClosed: apiClosed || source === "manual",
        isPartialApi: partialApi,
        source,
        note: entry?.note,
        revisionAt: entry?.revisionAt ?? null,
        updatedAt: entry?.updatedAt ?? null,
      };
    });
}

export function countMissingDays(rows: AdSpendDayRow[]): number {
  return rows.filter((r) => r.amount === null).length;
}

/** Resumo por loja para a vista consolidada. */
export async function buildStoreAdSpendSummaries(
  stores: Array<{
    _id: Types.ObjectId;
    name: string;
    importStartDate?: Date | null;
    createdAt?: Date;
    ianaTimezone?: string | null;
  }>,
  baseCurrency = "EUR",
): Promise<StoreAdSpendSummary[]> {
  const summaries = await Promise.all(
    stores.map(async (s) => {
      const calendar = await buildAdSpendCalendar(
        s._id,
        baseCurrency,
        s.importStartDate,
        s.createdAt,
        s.ianaTimezone,
      );
      const missing = calendar.filter((d) => d.amount === null);
      return {
        storeId: String(s._id),
        storeName: s.name,
        missingCount: missing.length,
        yesterdayMissing: missing.some((d) => d.isYesterday),
      };
    }),
  );
  return summaries.sort((a, b) => b.missingCount - a.missingCount);
}

export type AdSpendExportRow = {
  dateKey: string;
  meta: number | null;
  google: number | null;
  tiktok: number | null;
  adsTotal: number | null;
  fees: number | null;
  grandTotal: number | null;
  source: string | null;
  note: string;
};

function platformAmount(
  lines: AdSpendLineView[],
  platform: "meta" | "google" | "tiktok",
): number | null {
  const line = lines.find((l) => l.platform === platform);
  if (!line) return null;
  return line.totalBase > 0 ? line.totalBase : line.amount;
}

/** Calendário de ad spend em linhas para CSV. */
export async function listAdSpendForExport(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess">,
  storeId: string,
): Promise<{ rows: AdSpendExportRow[]; storeName: string } | null> {
  if (!canAccessStore(user.storeAccess, storeId)) return null;
  await connectToDatabase();

  const store = await Store.findOne({
    ...activeStoreQueryForUser(user),
    _id: storeId,
  })
    .select("name importStartDate createdAt")
    .lean();
  if (!store) return null;

  const workspace = await Workspace.findById(user.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = workspace?.baseCurrency ?? "EUR";

  const calendar = await buildAdSpendCalendar(
    store._id,
    baseCurrency,
    store.importStartDate,
    store.createdAt,
  );

  const rows: AdSpendExportRow[] = calendar.map((d) => {
    const meta = d.lines.length ? platformAmount(d.lines, "meta") : d.amount;
    const google = d.lines.length ? platformAmount(d.lines, "google") : null;
    const tiktok = d.lines.length ? platformAmount(d.lines, "tiktok") : null;
    const adsTotal = d.amount;
    const fees = d.extraFee;
    const grandTotal = d.totalAmount;
    return {
      dateKey: d.dateKey,
      meta,
      google,
      tiktok,
      adsTotal,
      fees,
      grandTotal,
      source: d.source,
      note: d.note ?? "",
    };
  });

  return { rows, storeName: store.name };
}
