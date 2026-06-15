import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { Payout } from "@/models/Payout";
import { BalanceTransaction } from "@/models/BalanceTransaction";
import { Order } from "@/models/Order";
import { sumAdSpendForPeriod } from "@/lib/ad-spend";
import { moneyToBase } from "@/lib/fx";
import {
  cogsSumBaseExpr,
  orderModeCogsSumExpr,
  shippingSumBaseExpr,
} from "@/lib/order-money";
import type { CogsMode } from "@/lib/cogs-modes";
import { endOfDay, formatRangeLabel } from "@/lib/period";
import {
  normalizeStoreTimezone,
  orderDateMatchInTimezone,
} from "@/lib/store-timezone";
import { canAccessStore, type StoreAccess } from "@/lib/store-access";
import { NON_ARCHIVED_STORE_FILTER } from "@/lib/store-scope";
import { sumManualCashByStores } from "@/lib/cash-entries";
import { orderDateMatch } from "@/lib/period";

const INCOMING_PAYOUT_STATUSES = new Set([
  "pending",
  "scheduled",
  "in_transit",
  "action_required",
]);

export type IncomingDayLine = {
  date: string;
  dateLabel: string;
  amount: number;
  amountFmt: string;
  /** Payout agendado vs vendas pendentes vs já recebido. */
  kind: "payout" | "pending" | "received";
  kindLabel: string;
};

export type StoreTreasuryLine = {
  storeId: string;
  storeName: string;
  currency: string;
  /** Data desde a qual contamos entradas/saídas (saldo inicial ou início da loja). */
  sinceDate: string | null;
  sinceLabel: string;
  /** Saldo na Shopify (por pagar no próximo payout). */
  available: number;
  availableFmt: string;
  /** Payouts agendados / a caminho (total). */
  incoming: number;
  incomingFmt: string;
  /** Já recebido no banco (desde saldo inicial ou 90d). */
  received: number;
  receivedFmt: string;
  startingBalance: number;
  startingBalanceFmt: string;
  startingBalanceDate: string | null;
  /** COGS + envio + ads desde `sinceDate`. */
  outflowsCogs: number;
  outflowsCogsFmt: string;
  outflowsShipping: number;
  outflowsShippingFmt: string;
  outflowsAdSpend: number;
  outflowsAdSpendFmt: string;
  outflowsTotal: number;
  outflowsTotalFmt: string;
  /** Capital injectado manualmente desde `sinceDate`. */
  manualIn: number;
  manualInFmt: string;
  /** Levantamentos manuais desde `sinceDate`. */
  manualOut: number;
  manualOutFmt: string;
  /** Por pagar na Shopify + payouts a caminho. */
  shopifyPending: number;
  shopifyPendingFmt: string;
  shopifyPendingTitle: string;
  /** Saldo em conta ≈ inicial + recebido − saídas conhecidas. */
  cashOnHand: number;
  cashOnHandFmt: string;
  cashOnHandTitle: string;
  /** Com o que ainda vem da Shopify (por pagar + a caminho). */
  projectedCash: number;
  projectedCashFmt: string;
  projectedCashTitle: string;
  /** @deprecated usar projectedCash — mantido para compatibilidade */
  projected: number;
  projectedFmt: string;
  projectedTitle: string;
  incomingByDay: IncomingDayLine[];
  /** Payouts já pagos (entrada na conta), por dia. */
  receivedByDay: IncomingDayLine[];
  payoutsError: string | null;
};

export type WorkspaceTreasury = {
  currency: string;
  stores: StoreTreasuryLine[];
  totals: {
    available: number;
    availableFmt: string;
    incoming: number;
    incomingFmt: string;
    received: number;
    receivedFmt: string;
    outflowsTotal: number;
    outflowsTotalFmt: string;
    manualIn: number;
    manualInFmt: string;
    manualOut: number;
    manualOutFmt: string;
    shopifyPending: number;
    shopifyPendingFmt: string;
    cashOnHand: number;
    cashOnHandFmt: string;
    cashOnHandTitle: string;
    projectedCash: number;
    projectedCashFmt: string;
    projectedCashTitle: string;
    projected: number;
    projectedFmt: string;
    projectedTitle: string;
  };
  incomingByDay: IncomingDayLine[];
  receivedByDay: IncomingDayLine[];
  generatedAt: string;
};

function normStatus(s?: string | null) {
  return (s ?? "").toLowerCase();
}

function dayKey(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function payoutReceivedAt(p: {
  paidAt?: Date | null;
  issuedAt?: Date | null;
}): Date | null {
  if (p.paidAt) return new Date(p.paidAt);
  if (p.issuedAt) return new Date(p.issuedAt);
  return null;
}

function countsTowardReceived(
  p: { status?: string | null; paidAt?: Date | null; issuedAt?: Date | null },
  startDate: Date | null,
  sinceFallback: Date,
): boolean {
  if (normStatus(p.status) !== "paid") return false;
  const at = payoutReceivedAt(p);
  if (!at) return false;
  if (startDate) return at >= startDate;
  return at >= sinceFallback;
}

async function buildReceivedByDay(
  payouts: Array<{
    status?: string | null;
    paidAt?: Date | null;
    issuedAt?: Date | null;
    net?: number | null;
    currency?: string | null;
  }>,
  startDate: Date | null,
  sinceFallback: Date,
  fmt: (v: number) => string,
  convertNet: (p: {
    net?: number | null;
    currency?: string | null;
    paidAt?: Date | null;
    issuedAt?: Date | null;
  }) => Promise<number>,
): Promise<IncomingDayLine[]> {
  const map = new Map<string, number>();

  for (const p of payouts) {
    if (!countsTowardReceived(p, startDate, sinceFallback)) continue;
    const at = payoutReceivedAt(p)!;
    const day = dayKey(at);
    if (!day) continue;
    const amount = await convertNet(p);
    map.set(day, (map.get(day) ?? 0) + amount);
  }

  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, amount]) => ({
      date,
      dateLabel: dayLabel(date),
      amount,
      amountFmt: fmt(amount),
      kind: "received" as const,
      kindLabel: "Recebido",
    }));
}

async function buildIncomingByDay(
  payouts: Array<{
    status?: string | null;
    issuedAt?: Date | null;
    createdAt?: Date;
    net?: number | null;
    currency?: string | null;
  }>,
  pendingTx: Array<{
    transactionDate: Date;
    net?: number | null;
    currency?: string | null;
  }>,
  fmt: (v: number) => string,
  convertPayoutNet: (p: {
    net?: number | null;
    currency?: string | null;
    issuedAt?: Date | null;
    createdAt?: Date;
  }) => Promise<number>,
  convertTxNet: (bt: {
    transactionDate: Date;
    net?: number | null;
    currency?: string | null;
  }) => Promise<number>,
): Promise<IncomingDayLine[]> {
  const map = new Map<string, { payout: number; pending: number }>();

  for (const p of payouts) {
    const st = normStatus(p.status);
    if (!INCOMING_PAYOUT_STATUSES.has(st)) continue;
    const day = dayKey(p.issuedAt ?? p.createdAt);
    if (!day) continue;
    const row = map.get(day) ?? { payout: 0, pending: 0 };
    row.payout += await convertPayoutNet(p);
    map.set(day, row);
  }

  for (const bt of pendingTx) {
    const day = dayKey(bt.transactionDate);
    if (!day) continue;
    const row = map.get(day) ?? { payout: 0, pending: 0 };
    row.pending += await convertTxNet(bt);
    map.set(day, row);
  }

  const lines: IncomingDayLine[] = [];
  for (const [date, amounts] of map.entries()) {
    if (amounts.payout > 0) {
      lines.push({
        date,
        dateLabel: dayLabel(date),
        amount: amounts.payout,
        amountFmt: fmt(amounts.payout),
        kind: "payout",
        kindLabel: "Payout",
      });
    }
    if (amounts.pending > 0) {
      lines.push({
        date,
        dateLabel: dayLabel(date),
        amount: amounts.pending,
        amountFmt: fmt(amounts.pending),
        kind: "pending",
        kindLabel: "Pendente",
      });
    }
  }

  return lines.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    return a.kind === "payout" ? -1 : 1;
  });
}

function mergeIncomingByDay(
  lines: IncomingDayLine[],
  currency: string,
): IncomingDayLine[] {
  const map = new Map<string, IncomingDayLine>();
  for (const line of lines) {
    const key = `${line.date}:${line.kind}`;
    const existing = map.get(key);
    if (existing) {
      existing.amount += line.amount;
      existing.amountFmt = formatCurrency(existing.amount, currency);
    } else {
      map.set(key, { ...line });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    return a.kind === "payout" ? -1 : 1;
  });
}

async function sumOrderOutflowsSince(
  storeId: mongoose.Types.ObjectId,
  since: Date,
  cogsMode: CogsMode,
  timeZone?: string | null,
): Promise<{ cogs: number; shipping: number }> {
  const slice = { start: since, end: endOfDay(new Date()) };
  const dateMatch = timeZone
    ? orderDateMatchInTimezone(slice, normalizeStoreTimezone(timeZone))
    : orderDateMatch(slice);

  const cogsExpr =
    cogsMode === "order" || cogsMode === "day"
      ? orderModeCogsSumExpr
      : cogsSumBaseExpr;

  const rows = await Order.aggregate<{ cogs: number; shipping: number }>([
    { $match: { storeId, ...dateMatch } },
    {
      $group: {
        _id: null,
        cogs: cogsExpr,
        shipping: shippingSumBaseExpr,
      },
    },
  ]);

  return { cogs: rows[0]?.cogs ?? 0, shipping: rows[0]?.shipping ?? 0 };
}

function resolveSinceDate(
  startDate: Date | null,
  fallback: Date,
  importStartDate?: Date | null,
  createdAt?: Date | null,
): Date {
  if (startDate) return startDate;
  if (importStartDate) return new Date(importStartDate);
  if (createdAt) return new Date(createdAt);
  return fallback;
}

export async function buildWorkspaceTreasury(
  workspaceId: string,
  storeId?: string,
  storeAccess: StoreAccess = "all",
): Promise<WorkspaceTreasury> {
  await connectToDatabase();

  const empty: WorkspaceTreasury = {
    currency: "EUR",
    stores: [],
    totals: {
      available: 0,
      availableFmt: formatCurrency(0, "EUR"),
      incoming: 0,
      incomingFmt: formatCurrency(0, "EUR"),
      received: 0,
      receivedFmt: formatCurrency(0, "EUR"),
      outflowsTotal: 0,
      outflowsTotalFmt: formatCurrency(0, "EUR"),
      manualIn: 0,
      manualInFmt: formatCurrency(0, "EUR"),
      manualOut: 0,
      manualOutFmt: formatCurrency(0, "EUR"),
      shopifyPending: 0,
      shopifyPendingFmt: formatCurrency(0, "EUR"),
      cashOnHand: 0,
      cashOnHandFmt: formatCurrency(0, "EUR"),
      cashOnHandTitle: formatCurrency(0, "EUR"),
      projectedCash: 0,
      projectedCashFmt: formatCurrency(0, "EUR"),
      projectedCashTitle: formatCurrency(0, "EUR"),
      projected: 0,
      projectedFmt: formatCurrency(0, "EUR"),
      projectedTitle: formatCurrency(0, "EUR"),
    },
    incomingByDay: [],
    receivedByDay: [],
    generatedAt: new Date().toISOString(),
  };
  if (!workspaceId) return empty;

  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const workspace = await Workspace.findById(wsId).lean();
  const currency = workspace?.baseCurrency ?? "EUR";
  const fmt = (v: number, c = currency) => formatCurrency(v, c);

  const storeQuery: Record<string, unknown> = {
    workspaceId: wsId,
    deletedAt: null,
    ...NON_ARCHIVED_STORE_FILTER,
  };
  if (storeId) {
    if (!canAccessStore(storeAccess, storeId)) return empty;
    storeQuery._id = new mongoose.Types.ObjectId(storeId);
  }

  let stores = await Store.find(storeQuery)
    .select(
      "name currency cogsMode startingBalance startingBalanceDate importStartDate createdAt ianaTimezone paymentsBalance payoutsError",
    )
    .lean();

  if (storeAccess !== "all") {
    stores = stores.filter((s) => canAccessStore(storeAccess, String(s._id)));
  }

  if (stores.length === 0) {
    const fmt = (v: number) => formatCurrency(v, currency);
    return {
      ...empty,
      currency,
      totals: {
        available: 0,
        availableFmt: fmt(0),
        incoming: 0,
        incomingFmt: fmt(0),
        received: 0,
        receivedFmt: fmt(0),
        outflowsTotal: 0,
        outflowsTotalFmt: fmt(0),
        manualIn: 0,
        manualInFmt: fmt(0),
        manualOut: 0,
        manualOutFmt: fmt(0),
        shopifyPending: 0,
        shopifyPendingFmt: fmt(0),
        cashOnHand: 0,
        cashOnHandFmt: fmt(0),
        cashOnHandTitle: fmt(0),
        projectedCash: 0,
        projectedCashFmt: fmt(0),
        projectedCashTitle: fmt(0),
        projected: 0,
        projectedFmt: fmt(0),
        projectedTitle: fmt(0),
      },
    };
  }

  const storeIds = stores.map((s) => s._id);
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const payouts = await Payout.find({
    storeId: { $in: storeIds },
  }).lean();

  const pendingTx = await BalanceTransaction.find({
    storeId: { $in: storeIds },
    payoutStatus: "pending",
  }).lean();

  const outflowByStore = await Promise.all(
    stores.map(async (s) => {
      const startDate = s.startingBalanceDate
        ? new Date(s.startingBalanceDate)
        : null;
      const since = resolveSinceDate(
        startDate,
        since90,
        s.importStartDate,
        s.createdAt,
      );
      const slice = { start: since, end: endOfDay(new Date()) };
      const cogsMode = (s.cogsMode ?? "shopify") as CogsMode;
      const [orderOut, adSpend] = await Promise.all([
        sumOrderOutflowsSince(s._id, since, cogsMode, s.ianaTimezone),
        sumAdSpendForPeriod(
          [s._id],
          slice,
          normalizeStoreTimezone(s.ianaTimezone),
        ),
      ]);
      return {
        storeId: String(s._id),
        since,
        cogs: orderOut.cogs,
        shipping: orderOut.shipping,
        adSpend,
      };
    }),
  );
  const outflowMap = new Map(outflowByStore.map((o) => [o.storeId, o]));

  const sinceByStore = new Map(
    outflowByStore.map((o) => [o.storeId, o.since]),
  );
  const storeCurrencyByStore = new Map(
    stores.map((s) => [String(s._id), (s.currency ?? currency).toUpperCase()]),
  );
  const manualCashMap = await sumManualCashByStores(
    workspaceId,
    storeIds,
    sinceByStore,
    currency,
    storeCurrencyByStore,
  );

  const todayKey = new Date().toISOString().slice(0, 10);
  const fmtBase = (v: number) => fmt(v, currency);

  const lines: StoreTreasuryLine[] = await Promise.all(
    stores.map(async (s) => {
    const sid = String(s._id);
    const storeCurrency = storeCurrencyByStore.get(sid) ?? currency;
    const availableRaw = s.paymentsBalance ?? 0;
    const startingBalanceRaw = s.startingBalance ?? 0;
    const startDate = s.startingBalanceDate
      ? new Date(s.startingBalanceDate)
      : null;
    const out = outflowMap.get(sid)!;
    const since = out.since;
    const sinceLabel = formatRangeLabel(since, endOfDay(new Date()));
    const startKey =
      (startDate ? dayKey(startDate) : null) ??
      since.toISOString().slice(0, 10);

    const payoutToBase = async (p: {
      net?: number | null;
      currency?: string | null;
      issuedAt?: Date | null;
      createdAt?: Date;
      paidAt?: Date | null;
    }) => {
      const date =
        dayKey(p.paidAt ?? p.issuedAt ?? p.createdAt) ?? todayKey;
      const cur = (p.currency ?? storeCurrency).toUpperCase();
      return moneyToBase(p.net ?? 0, cur, currency, date);
    };

    const txToBase = async (bt: {
      transactionDate: Date;
      net?: number | null;
      currency?: string | null;
    }) => {
      const date = dayKey(bt.transactionDate) ?? todayKey;
      const cur = (bt.currency ?? storeCurrency).toUpperCase();
      return moneyToBase(bt.net ?? 0, cur, currency, date);
    };

    const storePayouts = payouts.filter((p) => String(p.storeId) === sid);
    const storePendingTx = pendingTx.filter((bt) => String(bt.storeId) === sid);

    const incomingPayouts = storePayouts.filter((p) =>
      INCOMING_PAYOUT_STATUSES.has(normStatus(p.status)),
    );
    let incoming = 0;
    for (const p of incomingPayouts) {
      incoming += await payoutToBase(p);
    }

    let received = 0;
    for (const p of storePayouts) {
      if (!countsTowardReceived(p, startDate, since90)) continue;
      received += await payoutToBase(p);
    }

    const available = await moneyToBase(
      availableRaw,
      storeCurrency,
      currency,
      todayKey,
    );
    const startingBalance = await moneyToBase(
      startingBalanceRaw,
      storeCurrency,
      currency,
      startKey,
    );

    const outflowsTotal = out.cogs + out.shipping + out.adSpend;
    const manual = manualCashMap.get(sid) ?? { manualIn: 0, manualOut: 0 };
    const shopifyPending = available + incoming;
    const cashOnHand =
      startingBalance +
      received +
      manual.manualIn -
      outflowsTotal -
      manual.manualOut;
    const projectedCash = cashOnHand + shopifyPending;
    const projected = projectedCash;

    const incomingByDay = await buildIncomingByDay(
      storePayouts,
      storePendingTx,
      fmtBase,
      payoutToBase,
      txToBase,
    );

    const receivedByDay = await buildReceivedByDay(
      storePayouts,
      startDate,
      since90,
      fmtBase,
      payoutToBase,
    );

    return {
      storeId: sid,
      storeName: s.name,
      currency,
      sinceDate: since.toISOString().slice(0, 10),
      sinceLabel,
      available,
      availableFmt: fmtBase(available),
      incoming,
      incomingFmt: fmtBase(incoming),
      received,
      receivedFmt: fmtBase(received),
      startingBalance,
      startingBalanceFmt: fmtBase(startingBalance),
      startingBalanceDate: startDate
        ? startDate.toISOString().slice(0, 10)
        : null,
      outflowsCogs: out.cogs,
      outflowsCogsFmt: fmtBase(out.cogs),
      outflowsShipping: out.shipping,
      outflowsShippingFmt: fmtBase(out.shipping),
      outflowsAdSpend: out.adSpend,
      outflowsAdSpendFmt: fmtBase(out.adSpend),
      outflowsTotal,
      outflowsTotalFmt: fmtBase(outflowsTotal),
      manualIn: manual.manualIn,
      manualInFmt: fmtBase(manual.manualIn),
      manualOut: manual.manualOut,
      manualOutFmt: fmtBase(manual.manualOut),
      shopifyPending,
      shopifyPendingFmt: fmtBase(shopifyPending),
      shopifyPendingTitle: fmtBase(shopifyPending),
      cashOnHand,
      cashOnHandFmt: formatCurrencyCompact(cashOnHand, currency),
      cashOnHandTitle: fmtBase(cashOnHand),
      projectedCash,
      projectedCashFmt: formatCurrencyCompact(projectedCash, currency),
      projectedCashTitle: fmtBase(projectedCash),
      projected,
      projectedFmt: formatCurrencyCompact(projected, currency),
      projectedTitle: fmtBase(projected),
      incomingByDay,
      receivedByDay,
      payoutsError: s.payoutsError ?? null,
    };
  }),
  );

  const sum = (key: keyof StoreTreasuryLine) =>
    lines.reduce((a, l) => a + (l[key] as number), 0);

  const allIncomingByDay = mergeIncomingByDay(
    lines.flatMap((l) => l.incomingByDay),
    currency,
  );

  const allReceivedByDay = mergeIncomingByDay(
    lines.flatMap((l) => l.receivedByDay),
    currency,
  ).map((line) => ({
    ...line,
    kind: "received" as const,
    kindLabel: "Recebido",
  }));

  const projectedTotal = sum("projectedCash");
  const cashOnHandTotal = sum("cashOnHand");
  const outflowsTotal = sum("outflowsTotal");
  const manualInTotal = sum("manualIn");
  const manualOutTotal = sum("manualOut");
  const shopifyPendingTotal = sum("shopifyPending");

  return {
    currency,
    stores: lines.sort((a, b) => b.cashOnHand - a.cashOnHand),
    totals: {
      available: sum("available"),
      availableFmt: fmt(sum("available")),
      incoming: sum("incoming"),
      incomingFmt: fmt(sum("incoming")),
      received: sum("received"),
      receivedFmt: fmt(sum("received")),
      outflowsTotal,
      outflowsTotalFmt: fmt(outflowsTotal),
      manualIn: manualInTotal,
      manualInFmt: fmt(manualInTotal),
      manualOut: manualOutTotal,
      manualOutFmt: fmt(manualOutTotal),
      shopifyPending: shopifyPendingTotal,
      shopifyPendingFmt: fmt(shopifyPendingTotal),
      cashOnHand: cashOnHandTotal,
      cashOnHandFmt: formatCurrencyCompact(cashOnHandTotal, currency),
      cashOnHandTitle: fmt(cashOnHandTotal),
      projectedCash: projectedTotal,
      projectedCashFmt: formatCurrencyCompact(projectedTotal, currency),
      projectedCashTitle: fmt(projectedTotal),
      projected: projectedTotal,
      projectedFmt: formatCurrencyCompact(projectedTotal, currency),
      projectedTitle: fmt(projectedTotal),
    },
    incomingByDay: allIncomingByDay,
    receivedByDay: allReceivedByDay,
    generatedAt: new Date().toISOString(),
  };
}
