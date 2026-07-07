import "server-only";
import type { Types } from "mongoose";
import { EuCategoryFeeDay } from "@/models/EuCategoryFeeDay";
import { Order } from "@/models/Order";
import {
  EU_CATEGORY_FEE_EFFECTIVE_FROM,
  type EuCategoryFeeEntry,
} from "@/lib/eu-category-fees-types";
export {
  EU_CATEGORY_FEE_EFFECTIVE_FROM,
  type EuCategoryFeeEntry,
} from "@/lib/eu-category-fees-types";
import {
  getBaseCurrency,
  isCogsInputCurrency,
  resolveCogsRange,
  type CogsInputCurrency,
} from "@/lib/manual-cogs";
import { convertToBaseCurrency } from "@/lib/fx";
import {
  dayKeysBetweenInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import type { PeriodSlice } from "@/lib/ad-spend";
import { startOfDay, addDays, formatDateInput, parseDateInput } from "@/lib/period";
import type { CogsMode } from "@/lib/cogs-modes";

export function isEuCategoryFeeDay(dateKey: string): boolean {
  return dateKey >= EU_CATEGORY_FEE_EFFECTIVE_FROM;
}

export function filterEuCategoryFeeDayKeys(dayKeys: string[]): string[] {
  return dayKeys.filter(isEuCategoryFeeDay);
}

function resolveEuCategoryFeeRange(
  importStartDate?: Date | null,
  storeCreatedAt?: Date | null,
): { from: Date; to: Date; fromKey: string; toKey: string } {
  const range = resolveCogsRange(importStartDate, storeCreatedAt);
  const feeStart = parseDateInput(EU_CATEGORY_FEE_EFFECTIVE_FROM);
  if (!feeStart) return range;
  const feeFrom = startOfDay(feeStart);
  if (feeFrom > range.from) {
    return {
      ...range,
      from: feeFrom,
      fromKey: EU_CATEGORY_FEE_EFFECTIVE_FROM,
    };
  }
  return range;
}

export async function listRecentEuCategoryFees(
  storeId: Types.ObjectId,
  baseCurrency: string,
  limit = 24,
): Promise<EuCategoryFeeEntry[]> {
  const rows = await EuCategoryFeeDay.find({ storeId })
    .sort({ dateKey: -1 })
    .limit(limit)
    .lean();

  return rows.map((r) => ({
    dateKey: r.dateKey,
    label: formatDayLabel(r.dateKey),
    amount: r.amount,
    inputAmount: r.inputAmount ?? null,
    inputCurrency: r.inputCurrency ?? null,
    fxRate: r.fxRate ?? null,
    note: r.note ?? "",
    baseCurrency,
  }));
}

export type EuCategoryFeeRow = {
  dateKey: string;
  label: string;
  amount: number | null;
  inputAmount: number | null;
  inputCurrency: string | null;
  fxRate: number | null;
  baseCurrency: string;
  hasOrders: boolean;
  isYesterday: boolean;
  note?: string;
};

function formatDayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

export function appliesEuCategoryFees(mode?: CogsMode | null): boolean {
  return mode === "shopify" || mode === "variant";
}

export async function saveEuCategoryFeeDay(
  workspaceId: Types.ObjectId,
  storeId: Types.ObjectId,
  dateKey: string,
  inputAmount: number,
  inputCurrency: CogsInputCurrency,
  userId?: Types.ObjectId | null,
  note?: string,
): Promise<void> {
  const baseCurrency = await getBaseCurrency(workspaceId);
  const fx = await convertToBaseCurrency(
    inputAmount,
    inputCurrency,
    baseCurrency,
    dateKey,
  );

  await EuCategoryFeeDay.updateOne(
    { storeId, dateKey },
    {
      $set: {
        workspaceId,
        amount: fx.amountBase,
        currency: baseCurrency,
        inputAmount: fx.inputAmount,
        inputCurrency: fx.inputCurrency,
        fxRate: fx.fxRate,
        note: note ?? "",
        updatedBy: userId ?? null,
      },
    },
    { upsert: true },
  );
}

export async function buildEuCategoryFeeRows(
  store: {
    _id: Types.ObjectId;
    workspaceId: Types.ObjectId;
    importStartDate?: Date | null;
    createdAt?: Date | null;
    ianaTimezone?: string | null;
  },
  baseCurrency: string,
): Promise<EuCategoryFeeRow[]> {
  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const { from, to, toKey } = resolveEuCategoryFeeRange(
    store.importStartDate,
    store.createdAt,
  );
  const dayKeys = dayKeysBetweenInTimezone(from, to, tz);
  const yesterdayKey = dayKeys[dayKeys.length - 1] ?? toKey;

  const [feeRows, orderDays] = await Promise.all([
    EuCategoryFeeDay.find({ storeId: store._id, dateKey: { $in: dayKeys } }).lean(),
    Order.aggregate<{ _id: string }>([
      { $match: { storeId: store._id } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$orderDate",
              timezone: tz,
            },
          },
        },
      },
      { $match: { _id: { $gte: EU_CATEGORY_FEE_EFFECTIVE_FROM } } },
    ]),
  ]);

  const feeMap = new Map(feeRows.map((r) => [r.dateKey, r]));
  const orderDaySet = new Set(orderDays.map((r) => r._id));

  return dayKeys.map((dateKey) => {
    const m = feeMap.get(dateKey);
    return {
      dateKey,
      label: formatDayLabel(dateKey),
      amount: m?.amount ?? null,
      inputAmount: m?.inputAmount ?? null,
      inputCurrency: m?.inputCurrency ?? null,
      fxRate: m?.fxRate ?? null,
      baseCurrency,
      hasOrders: orderDaySet.has(dateKey),
      isYesterday: dateKey === yesterdayKey,
      note: m?.note ?? "",
    };
  });
}

export async function sumEuCategoryFeesForPeriod(
  storeIds: Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<number> {
  if (!storeIds.length) return 0;

  let dayKeys: string[];
  if (slice.specificDates?.length) {
    dayKeys = [...slice.specificDates];
  } else if (storeTimeZone) {
    dayKeys = dayKeysBetweenInTimezone(
      slice.start,
      slice.end,
      normalizeStoreTimezone(storeTimeZone),
    );
  } else {
    dayKeys = [];
    let cur = startOfDay(slice.start);
    const end = startOfDay(slice.end);
    while (cur <= end) {
      dayKeys.push(formatDateInput(cur));
      cur = addDays(cur, 1);
    }
  }

  if (!dayKeys.length) return 0;

  const eligibleKeys = filterEuCategoryFeeDayKeys(dayKeys);
  if (!eligibleKeys.length) return 0;

  const rows = await EuCategoryFeeDay.aggregate<{ total: number }>([
    { $match: { storeId: { $in: storeIds }, dateKey: { $in: eligibleKeys } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return rows[0]?.total ?? 0;
}

export async function sumEuCategoryFeesByDay(
  storeId: Types.ObjectId,
  dayKeys: string[],
): Promise<Map<string, number>> {
  if (!dayKeys.length) return new Map();

  const eligibleKeys = filterEuCategoryFeeDayKeys(dayKeys);
  if (!eligibleKeys.length) return new Map();

  const rows = await EuCategoryFeeDay.find({
    storeId,
    dateKey: { $in: eligibleKeys },
  })
    .select("dateKey amount")
    .lean();

  return new Map(rows.map((r) => [r.dateKey, r.amount]));
}

export async function countMissingEuCategoryFeeDays(
  store: {
    _id: Types.ObjectId;
    workspaceId: Types.ObjectId;
    importStartDate?: Date | null;
    createdAt?: Date | null;
    ianaTimezone?: string | null;
  },
): Promise<number> {
  const baseCurrency = await getBaseCurrency(store.workspaceId);
  const rows = await buildEuCategoryFeeRows(store, baseCurrency);
  return rows.filter((r) => r.hasOrders && r.amount === null).length;
}

export { isCogsInputCurrency };
