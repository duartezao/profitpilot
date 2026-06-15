import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { Payout } from "@/models/Payout";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import { canAccessStore } from "@/lib/store-access";
import type { CurrentUser } from "@/lib/auth";

const statusLabel: Record<string, string> = {
  scheduled: "Agendado",
  in_transit: "A caminho",
  paid: "Pago",
  failed: "Falhou",
  canceled: "Cancelado",
};

const statusCls: Record<string, string> = {
  scheduled: "text-warning",
  in_transit: "text-accent",
  paid: "text-positive",
  failed: "text-negative",
  canceled: "text-muted-foreground",
};

function norm(s?: string | null) {
  return (s ?? "").toLowerCase();
}

export type PayoutRow = {
  id: string;
  storeId: string;
  storeName: string;
  issuedAt: string | null;
  status: string;
  statusLabel: string;
  statusCls: string;
  feeFmt: string;
  netFmt: string;
};

export type PayoutsView = {
  currency: string;
  scopeName: string | null;
  kpis: { label: string; value: string }[];
  payoutErrors: { storeId: string; name: string; error: string }[];
  payouts: PayoutRow[];
};

export async function buildPayoutsView(
  user: CurrentUser,
  storeId?: string,
): Promise<PayoutsView> {
  await connectToDatabase();

  const workspace = user.workspaceId
    ? await Workspace.findById(user.workspaceId).lean()
    : null;
  const currency = workspace?.baseCurrency ?? "EUR";

  const storeQuery = activeStoreQueryForUser(user);
  if (storeId && canAccessStore(user.storeAccess, storeId)) {
    storeQuery._id = storeId;
  }

  const stores = await Store.find(storeQuery)
    .select("name paymentsBalance payoutsError")
    .lean();
  const scopeName = storeId
    ? (stores.find((s) => String(s._id) === storeId)?.name ?? null)
    : null;
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));
  const payoutErrors = stores
    .filter((s) => s.payoutsError)
    .map((s) => ({
      storeId: String(s._id),
      name: s.name,
      error: s.payoutsError!,
    }));

  const payoutQuery: Record<string, unknown> = {
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
  };
  if (storeId) payoutQuery.storeId = new mongoose.Types.ObjectId(storeId);

  const payouts = await Payout.find(payoutQuery)
    .sort({ issuedAt: -1 })
    .limit(100)
    .lean();

  const saldoAtual = stores.reduce((sum, s) => sum + (s.paymentsBalance ?? 0), 0);
  const aCaminho = payouts
    .filter((p) => ["scheduled", "in_transit"].includes(norm(p.status)))
    .reduce((sum, p) => sum + (p.net ?? 0), 0);
  const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const paid30 = payouts.filter(
    (p) =>
      norm(p.status) === "paid" &&
      p.issuedAt &&
      new Date(p.issuedAt).getTime() >= since30,
  );
  const recebido30 = paid30.reduce((sum, p) => sum + (p.net ?? 0), 0);
  const taxas30 = paid30.reduce((sum, p) => sum + (p.fee ?? 0), 0);

  const kpis = [
    { label: "Saldo atual (por pagar)", value: formatCurrency(saldoAtual, currency) },
    { label: "A caminho", value: formatCurrency(aCaminho, currency) },
    { label: "Recebido (30 dias)", value: formatCurrency(recebido30, currency) },
    { label: "Taxas Shopify (30 dias)", value: formatCurrency(taxas30, currency) },
  ];

  const rows: PayoutRow[] = payouts.map((p) => {
    const st = norm(p.status);
    const cur = p.currency ?? currency;
    return {
      id: String(p._id),
      storeId: String(p.storeId),
      storeName: storeName.get(String(p.storeId)) ?? "—",
      issuedAt: p.issuedAt
        ? new Date(p.issuedAt).toLocaleDateString("pt-PT")
        : null,
      status: p.status ?? "",
      statusLabel: statusLabel[st] ?? p.status ?? "—",
      statusCls: statusCls[st] ?? "",
      feeFmt: formatCurrency(p.fee ?? 0, cur),
      netFmt: formatCurrency(p.net ?? 0, cur),
    };
  });

  return {
    currency,
    scopeName,
    kpis,
    payoutErrors,
    payouts: rows,
  };
}

export type PayoutExportRow = {
  storeName: string;
  issuedAtIso: string;
  status: string;
  fee: number;
  net: number;
  gross: number;
  currency: string;
};

/** Payouts para exportação CSV (até 2000). */
export async function listPayoutsForExport(
  user: CurrentUser,
  storeId?: string,
  limit = 2000,
): Promise<{ rows: PayoutExportRow[]; scopeName: string | null }> {
  await connectToDatabase();

  const storeQuery = activeStoreQueryForUser(user);
  if (storeId && canAccessStore(user.storeAccess, storeId)) {
    storeQuery._id = storeId;
  }

  const stores = await Store.find(storeQuery).select("name").lean();
  const scopeName = storeId
    ? (stores.find((s) => String(s._id) === storeId)?.name ?? null)
    : null;
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));

  const payoutQuery: Record<string, unknown> = {
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
  };
  if (storeId) payoutQuery.storeId = new mongoose.Types.ObjectId(storeId);

  const payouts = await Payout.find(payoutQuery)
    .sort({ issuedAt: -1 })
    .limit(limit)
    .lean();

  const rows: PayoutExportRow[] = payouts.map((p) => ({
    storeName: storeName.get(String(p.storeId)) ?? "—",
    issuedAtIso: p.issuedAt ? new Date(p.issuedAt).toISOString() : "",
    status: norm(p.status),
    fee: p.fee ?? 0,
    net: p.net ?? 0,
    gross: p.gross ?? 0,
    currency: p.currency ?? "EUR",
  }));

  return { rows, scopeName };
}
