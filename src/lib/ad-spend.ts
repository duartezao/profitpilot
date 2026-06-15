import "server-only";
import type { Types } from "mongoose";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { Order } from "@/models/Order";
import {
  addDays,
  formatDateInput,
  parseDateInput,
  startOfDay,
  endOfDay,
} from "@/lib/period";
import { isAdSpendDayLockedForApi } from "@/lib/ad-spend-lock";

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

export type AdSpendDayRow = {
  dateKey: string;
  label: string;
  /** Valor na moeda base (EUR). */
  amount: number | null;
  inputAmount: number | null;
  inputCurrency: string | null;
  fxRate: number | null;
  extraFee: number | null;
  inputExtraFee: number | null;
  /** amount + extraFee na moeda base. */
  totalAmount: number | null;
  baseCurrency: string;
  hasOrders: boolean;
  isYesterday: boolean;
  /** Fechado — sync API não volta a escrever (ontem e anteriores). */
  isLocked: boolean;
  source: "manual" | "api" | null;
  note?: string;
};

export type StoreAdSpendSummary = {
  storeId: string;
  storeName: string;
  missingCount: number;
  yesterdayMissing: boolean;
};

function adSpendDateMatch(slice: PeriodSlice): Record<string, unknown> {
  if (slice.specificDates?.length) {
    return { dateKey: { $in: slice.specificDates } };
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

/** Soma ad spend manual de uma ou várias lojas num período. */
export async function sumAdSpendForPeriod(
  storeIds: Types.ObjectId[],
  slice: PeriodSlice,
): Promise<number> {
  if (!storeIds.length) return 0;

  const rows = await ManualAdSpend.aggregate<{ total: number }>([
    {
      $match: {
        storeId: { $in: storeIds },
        ...adSpendDateMatch(slice),
      },
    },
    { $group: { _id: null, total: { $sum: { $add: ["$amount", { $ifNull: ["$extraFee", 0] }] } } } },
  ]);

  return rows[0]?.total ?? 0;
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
): Promise<AdSpendDayRow[]> {
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
        "dateKey amount inputAmount inputCurrency fxRate extraFee inputExtraFee note currency source",
      )
      .lean(),
    orderDaysInRange(storeId, from, yesterday),
  ]);

  const byKey = new Map(
    entries.map((e) => [
      e.dateKey,
      {
        amount: e.amount,
        inputAmount: e.inputAmount,
        inputCurrency: e.inputCurrency,
        fxRate: e.fxRate,
        extraFee: e.extraFee,
        inputExtraFee: e.inputExtraFee,
        note: e.note ?? "",
        source: e.source as "manual" | "api" | undefined,
      },
    ]),
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
        baseCurrency,
        hasOrders: orderDays.has(dateKey),
        isYesterday: dateKey === yesterdayKey,
        isLocked: isAdSpendDayLockedForApi(dateKey),
        source: entry?.source ?? null,
        note: entry?.note,
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
