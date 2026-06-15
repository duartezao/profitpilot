import "server-only";
import type { Types } from "mongoose";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import {
  getTodayDateKey,
  isAdSpendDayLockedForApi,
  isAdSpendTodayOpen,
} from "@/lib/ad-spend-lock";
import { syncAdAccountsSpendForStore } from "@/lib/ad-api-sync";
import type { ApiAdSpendSyncResult } from "@/lib/ad-api-sync";

export type { ApiAdSpendSyncResult };

export type ApiAdSpendUpsertResult = "updated" | "skipped_locked" | "skipped_not_today";

/**
 * Grava gasto vindo das APIs de ads.
 * Regra: só o dia de hoje é substituído em cada sync; ontem e anteriores ficam fechados.
 */
export async function upsertApiAdSpendDay(
  workspaceId: Types.ObjectId,
  storeId: Types.ObjectId,
  dateKey: string,
  amountBase: number,
  baseCurrency: string,
  extra?: {
    inputAmount?: number | null;
    inputCurrency?: string | null;
    fxRate?: number | null;
    note?: string;
  },
): Promise<ApiAdSpendUpsertResult> {
  if (isAdSpendDayLockedForApi(dateKey)) {
    return "skipped_locked";
  }
  if (!isAdSpendTodayOpen(dateKey)) {
    return "skipped_not_today";
  }

  await ManualAdSpend.findOneAndUpdate(
    { storeId, dateKey },
    {
      $set: {
        workspaceId,
        storeId,
        dateKey,
        amount: amountBase,
        currency: baseCurrency,
        inputAmount: extra?.inputAmount ?? null,
        inputCurrency: extra?.inputCurrency ?? null,
        fxRate: extra?.fxRate ?? null,
        note: extra?.note ?? "",
        source: "api",
      },
    },
    { upsert: true, new: true },
  );

  return "updated";
}

/** Sync automático de ad spend por loja (contas API + regras de hoje). */
export async function syncApiAdSpendForStore(
  storeId: string,
): Promise<ApiAdSpendSyncResult> {
  return syncAdAccountsSpendForStore(storeId);
}

/** Corre após sync Shopify nas lojas com autoSync. */
export async function syncDueApiAdSpend(
  storeIds: string[],
): Promise<ApiAdSpendSyncResult[]> {
  const results: ApiAdSpendSyncResult[] = [];
  for (const id of storeIds) {
    try {
      results.push(await syncApiAdSpendForStore(id));
    } catch {
      results.push({
        storeId: id,
        today: getTodayDateKey(),
        updated: false,
        skippedReason: "no_data",
      });
    }
  }
  return results;
}
