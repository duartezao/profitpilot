import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { CashEntry, type CashEntryType } from "@/models/CashEntry";
import { formatCurrency } from "@/lib/utils";
import { parseDateInput } from "@/lib/period";

export type CashEntryRow = {
  id: string;
  storeId: string;
  type: "manual_in" | "manual_out";
  typeLabel: string;
  amount: number;
  amountFmt: string;
  signedFmt: string;
  currency: string;
  description: string;
  dueDateKey: string;
  dueDateLabel: string;
};

export type ManualCashTotals = {
  manualIn: number;
  manualOut: number;
};

const TYPE_LABEL: Record<"manual_in" | "manual_out", string> = {
  manual_in: "Injeção de capital",
  manual_out: "Levantamento",
};

export function cashEntryTypeLabel(type: "manual_in" | "manual_out"): string {
  return TYPE_LABEL[type];
}

/** Soma injeções e levantamentos por loja desde a data `since` (inclusive). */
export async function sumManualCashByStores(
  workspaceId: string,
  storeIds: mongoose.Types.ObjectId[],
  sinceByStore: Map<string, Date>,
): Promise<Map<string, ManualCashTotals>> {
  if (storeIds.length === 0) return new Map();

  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const todayKey = new Date().toISOString().slice(0, 10);

  const entries = await CashEntry.find({
    workspaceId: wsId,
    storeId: { $in: storeIds },
    type: { $in: ["manual_in", "manual_out"] },
    deletedAt: null,
    dueDateKey: { $lte: todayKey },
  })
    .select("storeId type amount dueDateKey")
    .lean();

  const totals = new Map<string, ManualCashTotals>();
  for (const sid of storeIds) {
    totals.set(String(sid), { manualIn: 0, manualOut: 0 });
  }

  for (const e of entries) {
    const sid = String(e.storeId);
    const since = sinceByStore.get(sid);
    if (!since) continue;
    const sinceKey = since.toISOString().slice(0, 10);
    if (e.dueDateKey < sinceKey) continue;

    const row = totals.get(sid)!;
    if (e.type === "manual_in") row.manualIn += e.amount ?? 0;
    else if (e.type === "manual_out") row.manualOut += e.amount ?? 0;
  }

  return totals;
}

export async function listCashEntriesForWorkspace(
  workspaceId: string,
  opts?: { storeIds?: string[]; limit?: number },
): Promise<CashEntryRow[]> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const limit = opts?.limit ?? 40;

  const filter: Record<string, unknown> = {
    workspaceId: wsId,
    type: { $in: ["manual_in", "manual_out"] },
    deletedAt: null,
  };
  if (opts?.storeIds?.length) {
    filter.storeId = {
      $in: opts.storeIds.map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  const entries = await CashEntry.find(filter)
    .sort({ dueDateKey: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return entries.map((e) => {
    const type = e.type as "manual_in" | "manual_out";
    const currency = e.currency ?? "EUR";
    const amount = e.amount ?? 0;
    const fmt = formatCurrency(amount, currency);
    const day = parseDateInput(e.dueDateKey);
    return {
      id: String(e._id),
      storeId: String(e.storeId),
      type,
      typeLabel: cashEntryTypeLabel(type),
      amount,
      amountFmt: fmt,
      signedFmt: type === "manual_in" ? `+${fmt}` : `−${fmt}`,
      currency,
      description: e.description ?? "",
      dueDateKey: e.dueDateKey,
      dueDateLabel: day
        ? day.toLocaleDateString("pt-PT")
        : e.dueDateKey,
    };
  });
}

export function isManualCashType(
  type: CashEntryType,
): type is "manual_in" | "manual_out" {
  return type === "manual_in" || type === "manual_out";
}
