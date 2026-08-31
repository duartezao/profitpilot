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
import type { PeriodInput } from "@/lib/period";
import { periodToDateKeys } from "@/lib/period-date-keys";
import {
  dateKeyInTimezone,
  dominantStoreTimezone,
  normalizeStoreTimezone,
  resolvePeriodForStore,
} from "@/lib/store-timezone";
import { resolvePayoutNetBase } from "@/lib/payout-shopify-fx";

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
  issuedAtKey: string | null;
  status: string;
  statusLabel: string;
  statusCls: string;
  feeFmt: string;
  netFmt: string;
};

export type PayoutsView = {
  currency: string;
  scopeName: string | null;
  periodLabel: string;
  kpis: { label: string; value: string }[];
  payoutErrors: { storeId: string; name: string; error: string }[];
  payouts: PayoutRow[];
};

export async function buildPayoutsView(
  user: CurrentUser,
  storeId?: string,
  periodInput: PeriodInput = {},
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
    .select("name currency paymentsBalance payoutsError ianaTimezone")
    .lean();
  const scopeName = storeId
    ? (stores.find((s) => String(s._id) === storeId)?.name ?? null)
    : null;
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));
  const storeCurrencyById = new Map(
    stores.map((s) => [String(s._id), (s.currency ?? currency).toUpperCase()]),
  );
  const storeTzById = new Map(
    stores.map((s) => [String(s._id), normalizeStoreTimezone(s.ianaTimezone)]),
  );
  const payoutErrors = stores
    .filter((s) => s.payoutsError)
    .map((s) => ({
      storeId: String(s._id),
      name: s.name,
      error: s.payoutsError!,
    }));

  const tz = storeId
    ? normalizeStoreTimezone(stores[0]?.ianaTimezone)
    : dominantStoreTimezone(stores);
  const period = resolvePeriodForStore(periodInput, tz);
  const periodKeys = periodToDateKeys(period);

  const payoutQuery: Record<string, unknown> = {
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    issuedAt: { $gte: period.start, $lte: period.end },
  };
  if (storeId) payoutQuery.storeId = new mongoose.Types.ObjectId(storeId);

  const payoutsRaw = await Payout.find(payoutQuery)
    .sort({ issuedAt: -1 })
    .limit(500)
    .lean();

  const payouts = periodKeys.specificDates?.length
    ? payoutsRaw.filter((p) => {
        if (!p.issuedAt) return false;
        const sid = String(p.storeId);
        const storeTz = storeTzById.get(sid) ?? tz;
        const key = dateKeyInTimezone(new Date(p.issuedAt), storeTz);
        return periodKeys.specificDates!.includes(key);
      })
    : payoutsRaw;

  const saldoAtual = stores.reduce((sum, s) => sum + (s.paymentsBalance ?? 0), 0);

  const payoutNetInBase = async (p: (typeof payouts)[number]) => {
    const sid = String(p.storeId);
    const storeTz = storeTzById.get(sid) ?? tz;
    const storeCur = storeCurrencyById.get(sid) ?? currency;
    const dateKey = p.issuedAt
      ? dateKeyInTimezone(new Date(p.issuedAt), storeTz)
      : dateKeyInTimezone(new Date(), storeTz);
    return resolvePayoutNetBase(p, storeCur, currency, dateKey);
  };

  let aCaminho = 0;
  for (const p of payouts.filter((row) =>
    ["scheduled", "in_transit"].includes(norm(row.status)),
  )) {
    aCaminho += await payoutNetInBase(p);
  }

  const paidInPeriod = payouts.filter((p) => norm(p.status) === "paid");
  let recebidoPeriodo = 0;
  let taxasPeriodo = 0;
  for (const p of paidInPeriod) {
    recebidoPeriodo += await payoutNetInBase(p);
    if (p.feeBase != null && Number.isFinite(p.feeBase)) {
      taxasPeriodo += p.feeBase;
    } else {
      const sid = String(p.storeId);
      const storeTz = storeTzById.get(sid) ?? tz;
      const storeCur = storeCurrencyById.get(sid) ?? currency;
      const dateKey = p.issuedAt
        ? dateKeyInTimezone(new Date(p.issuedAt), storeTz)
        : dateKeyInTimezone(new Date(), storeTz);
      taxasPeriodo += await resolvePayoutNetBase(
        { ...p, net: p.fee ?? 0 },
        storeCur,
        currency,
        dateKey,
      );
    }
  }

  const kpis = [
    { label: "Saldo atual (por pagar)", value: formatCurrency(saldoAtual, currency) },
    { label: "A caminho (período)", value: formatCurrency(aCaminho, currency) },
    {
      label: `Recebido (${period.label})`,
      value: formatCurrency(recebidoPeriodo, currency),
    },
    {
      label: `Taxas Shopify (${period.label})`,
      value: formatCurrency(taxasPeriodo, currency),
    },
  ];

  const rows: PayoutRow[] = payouts.map((p) => {
    const st = norm(p.status);
    const cur = p.currency ?? currency;
    const sid = String(p.storeId);
    const storeTz = storeTzById.get(sid) ?? tz;
    const issuedAtKey = p.issuedAt
      ? dateKeyInTimezone(new Date(p.issuedAt), storeTz)
      : null;
    return {
      id: String(p._id),
      storeId: sid,
      storeName: storeName.get(sid) ?? "—",
      issuedAt: p.issuedAt
        ? new Date(p.issuedAt).toLocaleDateString("pt-PT")
        : null,
      issuedAtKey,
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
    periodLabel: period.label,
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
