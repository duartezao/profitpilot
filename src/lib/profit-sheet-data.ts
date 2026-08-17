import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { aggregateDailyGoogleAdSpend } from "@/lib/ad-spend";
import { loadStoreDailyOrderTotalsByDay } from "@/lib/metrics";
import { findStoreForUser } from "@/lib/store-scope";
import {
  addDaysToDateKey,
  dateKeyInTimezone,
  dayKeysBetweenInTimezone,
  importDateKey,
  normalizeStoreTimezone,
  zonedEndOfDay,
  zonedStartOfDay,
} from "@/lib/store-timezone";
import type { CurrentUser } from "@/lib/auth";

export const PROFIT_SHEET_MONTH_SHEETS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Colunas preenchidas: B Gross Revenue, C Refunds, E COGS, G Adspend Google. */
export const PROFIT_SHEET_COL_GROSS = "B";
export const PROFIT_SHEET_COL_REFUNDS = "C";
export const PROFIT_SHEET_COL_COGS = "E";
export const PROFIT_SHEET_COL_GOOGLE = "G";
export const PROFIT_SHEET_DATA_ROW_OFFSET = 7;

export type ProfitSheetCellUpdate = {
  sheet: string;
  row: number;
  col: string;
  value: number;
};

export type ProfitSheetExportData = {
  storeName: string;
  importKey: string;
  endKey: string;
  updates: ProfitSheetCellUpdate[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function monthSheetForDateKey(dateKey: string): string | null {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return null;
  const month = Number(parts[1]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return PROFIT_SHEET_MONTH_SHEETS[month - 1];
}

export function dayOfMonthFromDateKey(dateKey: string): number | null {
  const day = Number(dateKey.split("-")[2]);
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
}

export function profitSheetCellRef(update: ProfitSheetCellUpdate): string {
  return `'${update.sheet}'!${update.col}${update.row}`;
}

/** Carrega valores diários a injectar no template (desde importação até ontem). */
export async function loadProfitSheetExportData(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess">,
  storeId: string,
): Promise<ProfitSheetExportData | null> {
  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    storeId,
    "name importStartDate createdAt ianaTimezone",
  );
  if (!store) return null;

  const storeTz = normalizeStoreTimezone(store.ianaTimezone);
  const importKey = importDateKey(
    store.importStartDate,
    store.createdAt,
    storeTz,
  );
  if (!importKey) return null;

  const todayKey = dateKeyInTimezone(new Date(), storeTz);
  const endKey = addDaysToDateKey(todayKey, -1, storeTz);
  if (endKey < importKey) return null;

  const slice = {
    start: zonedStartOfDay(importKey, storeTz),
    end: zonedEndOfDay(endKey, storeTz),
  };

  const storeOid = store._id as mongoose.Types.ObjectId;

  const [orderByDay, googleByDay] = await Promise.all([
    loadStoreDailyOrderTotalsByDay(user.workspaceId, storeId, importKey, endKey),
    aggregateDailyGoogleAdSpend([storeOid], slice, storeTz),
  ]);
  if (!orderByDay) return null;

  const updates: ProfitSheetCellUpdate[] = [];
  const dayKeys = dayKeysBetweenInTimezone(slice.start, slice.end, storeTz);

  for (const dateKey of dayKeys) {
    const sheetName = monthSheetForDateKey(dateKey);
    const day = dayOfMonthFromDateKey(dateKey);
    if (!sheetName || day == null) continue;

    const row = PROFIT_SHEET_DATA_ROW_OFFSET + day;
    const orders = orderByDay.get(dateKey) ?? {
      revenue: 0,
      refunds: 0,
      cogs: 0,
    };

    /** Gross Revenue = REV + reembolsos para Net Revenue (D) = REV da app. */
    const grossRevenue = roundMoney(orders.revenue + orders.refunds);
    updates.push({
      sheet: sheetName,
      row,
      col: PROFIT_SHEET_COL_GROSS,
      value: grossRevenue,
    });
    updates.push({
      sheet: sheetName,
      row,
      col: PROFIT_SHEET_COL_REFUNDS,
      value: roundMoney(orders.refunds),
    });
    updates.push({
      sheet: sheetName,
      row,
      col: PROFIT_SHEET_COL_COGS,
      value: roundMoney(orders.cogs),
    });

    const google = googleByDay.get(dateKey);
    if (google != null && google > 0) {
      updates.push({
        sheet: sheetName,
        row,
        col: PROFIT_SHEET_COL_GOOGLE,
        value: roundMoney(google),
      });
    }
  }

  return {
    storeName: store.name,
    importKey,
    endKey,
    updates,
  };
}
