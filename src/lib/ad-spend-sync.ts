import "server-only";
import type { Types } from "mongoose";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { Workspace } from "@/models/Workspace";
import { Store } from "@/models/Store";
import {
  getTodayDateKey,
  isAdSpendDayLockedForApi,
  isAdSpendTodayOpen,
} from "@/lib/ad-spend-lock";

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

export type ApiAdSpendSyncResult = {
  storeId: string;
  today: string;
  updated: boolean;
  skippedReason?: "no_accounts" | "locked" | "no_data";
};

/**
 * Sync automático de ad spend por loja.
 * Substitui sempre o valor de hoje; dias passados nunca são reescritos.
 * (Integração Meta/Google/TikTok por implementar — estrutura e regras já aplicam.)
 */
export async function syncApiAdSpendForStore(
  storeId: string,
): Promise<ApiAdSpendSyncResult> {
  const store = await Store.findById(storeId)
    .select("workspaceId")
    .lean();
  if (!store) {
    return {
      storeId,
      today: getTodayDateKey(),
      updated: false,
      skippedReason: "no_data",
    };
  }

  const workspace = await Workspace.findById(store.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = workspace?.baseCurrency ?? "EUR";
  const today = getTodayDateKey();

  // TODO: quando existirem adAccounts ligadas, buscar spend de hoje e converter.
  const hasAdAccounts = false;
  if (!hasAdAccounts) {
    return { storeId, today, updated: false, skippedReason: "no_accounts" };
  }

  const spendToday = 0;
  const result = await upsertApiAdSpendDay(
    store.workspaceId,
    store._id,
    today,
    spendToday,
    baseCurrency,
  );

  return {
    storeId,
    today,
    updated: result === "updated",
    skippedReason: result === "skipped_locked" ? "locked" : undefined,
  };
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
