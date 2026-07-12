import "server-only";
import type { Types } from "mongoose";
import { EuCategoryFeeDay } from "@/models/EuCategoryFeeDay";
import { Order } from "@/models/Order";
import { Store } from "@/models/Store";
import {
  EU_CUSTOMS_FEE_EFFECTIVE_FROM,
  EU_CUSTOMS_FEE_PER_ORDER_EUR,
  type EuCustomsFeeAutoSummary,
  type EuCustomsFeeDaySummary,
} from "@/lib/eu-category-fees-types";
export {
  EU_CUSTOMS_FEE_EFFECTIVE_FROM,
  EU_CUSTOMS_FEE_PER_ORDER_EUR,
  EU_CATEGORY_FEE_EFFECTIVE_FROM,
  type EuCustomsFeeAutoSummary,
  type EuCustomsFeeDaySummary,
  type EuCategoryFeeEntry,
} from "@/lib/eu-category-fees-types";
import {
  EU_SHIPPING_COUNTRY_CODES,
  isEuShippingCountry,
} from "@/lib/eu-customs-countries";
import { resolveEuCustomsFeeOrderScope } from "@/lib/eu-customs-fee-scope";
export { resolveEuCustomsFeeOrderScope, type EuCustomsFeeOrderScope } from "@/lib/eu-customs-fee-scope";
import { convertToBaseCurrency } from "@/lib/fx";
import { getBaseCurrency } from "@/lib/manual-cogs";
import type { CogsMode } from "@/lib/cogs-modes";
import { appliesAutoEuCustomsFees } from "@/lib/cogs-modes";
import {
  dayKeysBetweenInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import type { PeriodSlice } from "@/lib/ad-spend";
import {
  startOfDay,
  addDays,
  formatDateInput,
  parseDateInput,
} from "@/lib/period";
import { mergePaidOrderFilter } from "@/lib/order-financial-status";

/** Taxa EU automática — só lojas com COGS automático da Shopify. */
export { appliesAutoEuCustomsFees } from "@/lib/cogs-modes";

/** @deprecated use appliesAutoEuCustomsFees */
export function appliesEuCategoryFees(mode?: CogsMode | null): boolean {
  return appliesAutoEuCustomsFees(mode);
}

export function isEuCustomsFeeDay(dateKey: string): boolean {
  return dateKey >= EU_CUSTOMS_FEE_EFFECTIVE_FROM;
}

export function filterEuCustomsFeeDayKeys(dayKeys: string[]): string[] {
  return dayKeys.filter(isEuCustomsFeeDay);
}

/** @deprecated */
export const isEuCategoryFeeDay = isEuCustomsFeeDay;
/** @deprecated */
export const filterEuCategoryFeeDayKeys = filterEuCustomsFeeDayKeys;

function formatDayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function buildOrderDateMatch(
  dayKeys: string[],
  storeTimeZone?: string | null,
): Record<string, unknown> {
  const effectiveFrom = parseDateInput(EU_CUSTOMS_FEE_EFFECTIVE_FROM);
  const minDate = effectiveFrom ? startOfDay(effectiveFrom) : new Date(0);
  const tz = storeTimeZone ? normalizeStoreTimezone(storeTimeZone) : null;

  if (tz) {
    return {
      $expr: {
        $and: [
          {
            $gte: [
              {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$orderDate",
                  timezone: tz,
                },
              },
              EU_CUSTOMS_FEE_EFFECTIVE_FROM,
            ],
          },
          dayKeys.length
            ? {
                $in: [
                  {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: "$orderDate",
                      timezone: tz,
                    },
                  },
                  dayKeys,
                ],
              }
            : { $literal: true },
        ],
      },
    };
  }

  return {
    orderDate: { $gte: minDate },
    ...(dayKeys.length
      ? {
          $expr: {
            $in: [
              {
                $dateToString: { format: "%Y-%m-%d", date: "$orderDate" },
              },
              dayKeys,
            ],
          },
        }
      : {}),
  };
}

function euOrderMatch(
  storeIds: Types.ObjectId[],
  dayKeys: string[],
  storeTimeZone?: string | null,
  analyticsSessionCountry?: string | null,
) {
  const scope = resolveEuCustomsFeeOrderScope(analyticsSessionCountry);
  if (scope === "none") {
    return mergePaidOrderFilter({
      storeId: storeIds.length === 1 ? storeIds[0] : { $in: storeIds },
      _id: { $exists: false },
    });
  }

  const dateMatch = buildOrderDateMatch(dayKeys, storeTimeZone);
  const base = {
    storeId: storeIds.length === 1 ? storeIds[0] : { $in: storeIds },
    ...dateMatch,
  };

  if (scope === "all_paid_orders") {
    return mergePaidOrderFilter(base);
  }

  return mergePaidOrderFilter({
    ...base,
    shippingCountryCode: { $in: [...EU_SHIPPING_COUNTRY_CODES] },
  });
}

async function countEuOrdersByDay(
  storeIds: Types.ObjectId[],
  dayKeys: string[],
  storeTimeZone?: string | null,
  analyticsSessionCountry?: string | null,
): Promise<Map<string, number>> {
  const eligibleKeys = filterEuCustomsFeeDayKeys(dayKeys);
  if (!storeIds.length || !eligibleKeys.length) return new Map();

  if (storeIds.length === 1) {
    return countEuOrdersByDayForStore(
      storeIds[0]!,
      eligibleKeys,
      storeTimeZone,
      analyticsSessionCountry,
    );
  }

  const merged = new Map<string, number>();
  for (const storeId of storeIds) {
    const perStore = await countEuOrdersByDayForStore(
      storeId,
      eligibleKeys,
      storeTimeZone,
      analyticsSessionCountry,
    );
    for (const [dateKey, count] of perStore) {
      merged.set(dateKey, (merged.get(dateKey) ?? 0) + count);
    }
  }
  return merged;
}

async function countEuOrdersByDayForStore(
  storeId: Types.ObjectId,
  dayKeys: string[],
  storeTimeZone?: string | null,
  analyticsSessionCountry?: string | null,
): Promise<Map<string, number>> {
  const rows = await Order.aggregate<{ _id: string; count: number }>([
    {
      $match: euOrderMatch(
        [storeId],
        dayKeys,
        storeTimeZone,
        analyticsSessionCountry,
      ),
    },
    {
      $group: {
        _id: storeTimeZone
          ? {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$orderDate",
                timezone: normalizeStoreTimezone(storeTimeZone),
              },
            }
          : {
              $dateToString: { format: "%Y-%m-%d", date: "$orderDate" },
            },
        count: { $sum: 1 },
      },
    },
  ]);

  return new Map(rows.map((r) => [r._id, r.count]));
}

async function feePerOrderInBase(
  baseCurrency: string,
  dateKey: string,
): Promise<number> {
  if (baseCurrency === "EUR") return EU_CUSTOMS_FEE_PER_ORDER_EUR;
  const fx = await convertToBaseCurrency(
    EU_CUSTOMS_FEE_PER_ORDER_EUR,
    "EUR",
    baseCurrency,
    dateKey,
  );
  return fx.amountBase;
}

async function sumFeesFromDayCounts(
  counts: Map<string, number>,
  baseCurrency: string,
): Promise<{ total: number; byDay: Map<string, number> }> {
  const byDay = new Map<string, number>();
  let total = 0;
  for (const [dateKey, count] of counts) {
    if (count <= 0) continue;
    const unit = await feePerOrderInBase(baseCurrency, dateKey);
    const fee = Math.round(count * unit * 100) / 100;
    byDay.set(dateKey, fee);
    total += fee;
  }
  return { total: Math.round(total * 100) / 100, byDay };
}

export async function sumAutoEuCustomsFeesByDay(
  storeId: Types.ObjectId,
  dayKeys: string[],
  baseCurrency: string,
  storeTimeZone?: string | null,
  analyticsSessionCountry?: string | null,
): Promise<Map<string, number>> {
  const counts = await countEuOrdersByDay(
    [storeId],
    dayKeys,
    storeTimeZone,
    analyticsSessionCountry,
  );
  const { byDay } = await sumFeesFromDayCounts(counts, baseCurrency);
  return byDay;
}

/** @deprecated use sumAutoEuCustomsFeesByDay */
export async function sumEuCategoryFeesByDay(
  storeId: Types.ObjectId,
  dayKeys: string[],
): Promise<Map<string, number>> {
  const store = await Store.findById(storeId)
    .select("workspaceId ianaTimezone cogsMode analyticsSessionCountry")
    .lean();
  if (!store || !appliesAutoEuCustomsFees(store.cogsMode as CogsMode)) {
    return new Map();
  }
  const baseCurrency = await getBaseCurrency(store.workspaceId);
  return sumAutoEuCustomsFeesByDay(
    storeId,
    dayKeys,
    baseCurrency,
    store.ianaTimezone,
    store.analyticsSessionCountry,
  );
}

export async function sumAutoEuCustomsFeesForPeriod(
  storeIds: Types.ObjectId[],
  slice: PeriodSlice,
  baseCurrency: string,
  storeTimeZone?: string | null,
  analyticsSessionCountry?: string | null,
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

  const counts = await countEuOrdersByDay(
    storeIds,
    dayKeys,
    storeTimeZone,
    analyticsSessionCountry,
  );
  const { total } = await sumFeesFromDayCounts(counts, baseCurrency);
  return total;
}

/** @deprecated use sumAutoEuCustomsFeesForPeriod */
export async function sumEuCategoryFeesForPeriod(
  storeIds: Types.ObjectId[],
  slice: PeriodSlice,
  storeTimeZone?: string | null,
): Promise<number> {
  if (!storeIds.length) return 0;
  const store = await Store.findById(storeIds[0])
    .select("workspaceId cogsMode analyticsSessionCountry")
    .lean();
  if (!store || !appliesAutoEuCustomsFees(store.cogsMode as CogsMode)) {
    return 0;
  }
  const baseCurrency = await getBaseCurrency(store.workspaceId);
  return sumAutoEuCustomsFeesForPeriod(
    storeIds,
    slice,
    baseCurrency,
    storeTimeZone,
    store.analyticsSessionCountry,
  );
}

export async function buildEuCustomsFeeAutoSummary(
  store: {
    _id: Types.ObjectId;
    workspaceId: Types.ObjectId;
    ianaTimezone?: string | null;
    analyticsSessionCountry?: string | null;
    importStartDate?: Date | null;
    createdAt?: Date | null;
  },
  baseCurrency: string,
  periodSlice?: PeriodSlice,
  recentLimit = 14,
): Promise<EuCustomsFeeAutoSummary> {
  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const today = formatDateInput(new Date());
  const slice =
    periodSlice ??
    ({
      start: addDays(startOfDay(new Date()), -29),
      end: startOfDay(new Date()),
      specificDates: undefined,
    } satisfies PeriodSlice);

  const periodDayKeys = dayKeysBetweenInTimezone(slice.start, slice.end, tz);
  const periodCounts = await countEuOrdersByDay(
    [store._id],
    periodDayKeys,
    tz,
    store.analyticsSessionCountry,
  );
  const periodOrders = [...periodCounts.values()].reduce((s, n) => s + n, 0);
  const { total: periodFee, byDay } = await sumFeesFromDayCounts(
    periodCounts,
    baseCurrency,
  );

  const recentKeys = filterEuCustomsFeeDayKeys(
    dayKeysBetweenInTimezone(
      addDays(startOfDay(new Date()), -(recentLimit - 1)),
      startOfDay(new Date()),
      tz,
    ),
  )
    .filter((k) => k <= today)
    .sort()
    .slice(-recentLimit);

  const recentCounts = await countEuOrdersByDay(
    [store._id],
    recentKeys,
    tz,
    store.analyticsSessionCountry,
  );
  const { byDay: recentByDay } = await sumFeesFromDayCounts(
    recentCounts,
    baseCurrency,
  );
  const recentDays: EuCustomsFeeDaySummary[] = recentKeys
    .map((dateKey) => ({
      dateKey,
      label: formatDayLabel(dateKey),
      euOrders: recentCounts.get(dateKey) ?? 0,
      amount: recentByDay.get(dateKey) ?? 0,
      baseCurrency,
    }))
    .filter((d) => d.euOrders > 0 || d.amount > 0);

  return {
    automatic: true,
    feePerOrderEur: EU_CUSTOMS_FEE_PER_ORDER_EUR,
    effectiveFrom: EU_CUSTOMS_FEE_EFFECTIVE_FROM,
    baseCurrency,
    periodEuOrders: periodOrders,
    periodFee,
    recentDays,
  };
}

/** Remove registos manuais antigos — substituídos pelo cálculo automático. */
export async function purgeLegacyManualEuFeesForStore(
  storeId: Types.ObjectId,
): Promise<number> {
  const result = await EuCategoryFeeDay.deleteMany({ storeId });
  return result.deletedCount ?? 0;
}

export async function purgeLegacyManualEuFeesForShopifyStores(
  workspaceId: Types.ObjectId,
): Promise<number> {
  const stores = await Store.find({
    workspaceId,
    cogsMode: { $in: [null, "shopify"] },
  })
    .select("_id")
    .lean();
  if (!stores.length) return 0;
  const result = await EuCategoryFeeDay.deleteMany({
    storeId: { $in: stores.map((s) => s._id) },
  });
  return result.deletedCount ?? 0;
}

export async function countMissingEuCustomsOrdersWithoutCountry(
  storeId: Types.ObjectId,
  fromDateKey = EU_CUSTOMS_FEE_EFFECTIVE_FROM,
): Promise<number> {
  const store = await Store.findById(storeId)
    .select("analyticsSessionCountry cogsMode")
    .lean();
  if (!store || !appliesAutoEuCustomsFees(store.cogsMode as CogsMode)) {
    return 0;
  }
  if (
    resolveEuCustomsFeeOrderScope(store.analyticsSessionCountry) !==
    "eu_shipping_only"
  ) {
    return 0;
  }

  const effectiveFrom = parseDateInput(fromDateKey);
  if (!effectiveFrom) return 0;
  return Order.countDocuments(
    mergePaidOrderFilter({
      storeId,
      orderDate: { $gte: startOfDay(effectiveFrom) },
      $or: [
        { shippingCountryCode: { $exists: false } },
        { shippingCountryCode: null },
        { shippingCountryCode: "" },
      ],
    }),
  );
}

export { isEuShippingCountry };
