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

function buildReceivedByDay(
  payouts: Array<{
    status?: string | null;
    paidAt?: Date | null;
    issuedAt?: Date | null;
    net?: number | null;
  }>,
  startDate: Date | null,
  sinceFallback: Date,
  fmt: (v: number) => string,
): IncomingDayLine[] {
  const map = new Map<string, number>();

  for (const p of payouts) {
    if (!countsTowardReceived(p, startDate, sinceFallback)) continue;
    const at = payoutReceivedAt(p)!;
    const day = dayKey(at);
    if (!day) continue;
    map.set(day, (map.get(day) ?? 0) + (p.net ?? 0));
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

function buildIncomingByDay(
  payouts: Array<{
    status?: string | null;
    issuedAt?: Date | null;
    createdAt?: Date;
    net?: number | null;
  }>,
  pendingTx: Array<{ transactionDate: Date; net?: number | null }>,
  fmt: (v: number) => string,
): IncomingDayLine[] {
  const map = new Map<string, { payout: number; pending: number }>();

  for (const p of payouts) {
    const st = normStatus(p.status);
    if (!INCOMING_PAYOUT_STATUSES.has(st)) continue;
    const day = dayKey(p.issuedAt ?? p.createdAt);
    if (!day) continue;
    const row = map.get(day) ?? { payout: 0, pending: 0 };
    row.payout += p.net ?? 0;
    map.set(day, row);
  }

  for (const bt of pendingTx) {
    const day = dayKey(bt.transactionDate);
    if (!day) continue;
    const row = map.get(day) ?? { payout: 0, pending: 0 };
    row.pending += bt.net ?? 0;
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
  timeZone?: string | null,
): Promise<{ cogs: number; shipping: number }> {
  const slice = { start: since, end: endOfDay(new Date()) };
  const dateMatch = timeZone
    ? orderDateMatchInTimezone(slice, normalizeStoreTimezone(timeZone))
    : orderDateMatch(slice);

  const rows = await Order.aggregate<{ cogs: number; shipping: number }>([
    { $match: { storeId, ...dateMatch } },
    {
      $group: {
        _id: null,
        cogs: { $sum: "$cogs" },
        shipping: { $sum: "$shipping" },
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
      "name currency startingBalance startingBalanceDate importStartDate createdAt ianaTimezone paymentsBalance payoutsError",
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
      const [orderOut, adSpend] = await Promise.all([
        sumOrderOutflowsSince(s._id, since, s.ianaTimezone),
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
  const manualCashMap = await sumManualCashByStores(
    workspaceId,
    storeIds,
    sinceByStore,
  );

  const lines: StoreTreasuryLine[] = stores.map((s) => {
    const sid = String(s._id);
    const cur = s.currency ?? currency;
    const fmtCur = (v: number) => fmt(v, cur);
    const available = s.paymentsBalance ?? 0;
    const startingBalance = s.startingBalance ?? 0;
    const startDate = s.startingBalanceDate
      ? new Date(s.startingBalanceDate)
      : null;
    const out = outflowMap.get(sid)!;
    const since = out.since;
    const sinceLabel = formatRangeLabel(since, endOfDay(new Date()));

    const storePayouts = payouts.filter((p) => String(p.storeId) === sid);
    const storePendingTx = pendingTx.filter((bt) => String(bt.storeId) === sid);

    const incoming = storePayouts
      .filter((p) => INCOMING_PAYOUT_STATUSES.has(normStatus(p.status)))
      .reduce((sum, p) => sum + (p.net ?? 0), 0);

    const received = storePayouts
      .filter((p) => countsTowardReceived(p, startDate, since90))
      .reduce((sum, p) => sum + (p.net ?? 0), 0);

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

    const incomingByDay = buildIncomingByDay(
      storePayouts,
      storePendingTx,
      fmtCur,
    );

    const receivedByDay = buildReceivedByDay(
      storePayouts,
      startDate,
      since90,
      fmtCur,
    );

    return {
      storeId: sid,
      storeName: s.name,
      currency: cur,
      sinceDate: since.toISOString().slice(0, 10),
      sinceLabel,
      available,
      availableFmt: fmtCur(available),
      incoming,
      incomingFmt: fmtCur(incoming),
      received,
      receivedFmt: fmtCur(received),
      startingBalance,
      startingBalanceFmt: fmtCur(startingBalance),
      startingBalanceDate: startDate
        ? startDate.toISOString().slice(0, 10)
        : null,
      outflowsCogs: out.cogs,
      outflowsCogsFmt: fmtCur(out.cogs),
      outflowsShipping: out.shipping,
      outflowsShippingFmt: fmtCur(out.shipping),
      outflowsAdSpend: out.adSpend,
      outflowsAdSpendFmt: fmtCur(out.adSpend),
      outflowsTotal,
      outflowsTotalFmt: fmtCur(outflowsTotal),
      manualIn: manual.manualIn,
      manualInFmt: fmtCur(manual.manualIn),
      manualOut: manual.manualOut,
      manualOutFmt: fmtCur(manual.manualOut),
      shopifyPending,
      shopifyPendingFmt: fmtCur(shopifyPending),
      shopifyPendingTitle: fmtCur(shopifyPending),
      cashOnHand,
      cashOnHandFmt: formatCurrencyCompact(cashOnHand, cur),
      cashOnHandTitle: fmtCur(cashOnHand),
      projectedCash,
      projectedCashFmt: formatCurrencyCompact(projectedCash, cur),
      projectedCashTitle: fmtCur(projectedCash),
      projected,
      projectedFmt: formatCurrencyCompact(projected, cur),
      projectedTitle: fmtCur(projected),
      incomingByDay,
      receivedByDay,
      payoutsError: s.payoutsError ?? null,
    };
  });

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
