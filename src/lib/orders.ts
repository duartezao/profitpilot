import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { resolvePeriod, orderDateMatch, type PeriodInput } from "@/lib/period";
import {
  resolvePeriodForStore,
  orderDateMatchInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import {
  orderNetRevenueBase,
  orderProfitBase,
  orderRefundedBase,
} from "@/lib/order-money";
import { Order } from "@/models/Order";
import type { CurrentUser } from "@/lib/auth";
import { findStoreForUser } from "@/lib/store-scope";

export type OrderListRow = {
  id: string;
  name: string;
  orderDateLabel: string;
  financialStatusLabel: string;
  revenueFmt: string;
  profitFmt: string;
  refundedFmt: string;
  positive: boolean;
  hasRefund: boolean;
};

export type OrderListStats = {
  count: number;
  revenue: number;
  revenueFmt: string;
  aov: number;
  aovFmt: string;
  refunded: number;
  refundedFmt: string;
  refundRate: number;
  refundRateFmt: string;
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Pago",
  pending: "Pendente",
  partially_paid: "Parcialmente pago",
  refunded: "Reembolsado",
  partially_refunded: "Parcialmente reembolsado",
  voided: "Anulado",
  authorized: "Autorizado",
};

function normStatus(s?: string | null) {
  return (s ?? "").toLowerCase();
}

function statusLabel(s?: string | null) {
  const key = normStatus(s);
  return STATUS_LABELS[key] ?? (s || "—");
}

type OrderMoneyRow = Parameters<typeof orderProfitBase>[0];

type ListResult = {
  rows: OrderListRow[];
  stats: OrderListStats;
  storeName: string;
  periodLabel: string;
  currency: string;
};

async function resolveStoreContext(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess">,
  storeId: string,
  periodInput?: PeriodInput,
) {
  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    storeId,
    "name currency ianaTimezone",
  );
  const wsId = new mongoose.Types.ObjectId(user.workspaceId);
  const storeTz = store
    ? normalizeStoreTimezone(store.ianaTimezone)
    : null;
  const period = storeTz
    ? resolvePeriodForStore(periodInput, storeTz)
    : resolvePeriod(periodInput);
  const { Workspace } = await import("@/models/Workspace");
  const workspace = await Workspace.findById(wsId).lean();
  const currency =
    workspace?.baseCurrency ?? store?.currency ?? "EUR";

  return { period, wsId, store, currency, storeTz };
}

function buildStats(
  orders: OrderMoneyRow[],
  currency: string,
  fmt: (v: number) => string,
  fmtPct: (v: number) => string,
): OrderListStats {
  const count = orders.length;
  const revenue = orders.reduce((s, o) => s + orderNetRevenueBase(o), 0);
  const refunded = orders.reduce((s, o) => s + orderRefundedBase(o), 0);
  const aov = count > 0 ? revenue / count : 0;
  const refundRate = revenue > 0 ? (refunded / revenue) * 100 : 0;

  return {
    count,
    revenue,
    revenueFmt: fmt(revenue),
    aov,
    aovFmt: fmt(aov),
    refunded,
    refundedFmt: fmt(refunded),
    refundRate,
    refundRateFmt: fmtPct(refundRate),
  };
}

/** Lista de encomendas da loja no período (mais recentes primeiro). */
export async function listStoreOrders(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess">,
  storeId: string,
  periodInput?: PeriodInput,
  limit = 100,
): Promise<ListResult> {
  const { period, wsId, store, currency, storeTz } = await resolveStoreContext(
    user,
    storeId,
    periodInput,
  );
  const { formatCurrency, formatPercent } = await import("@/lib/utils");
  const fmt = (v: number) => formatCurrency(v, currency);
  const fmtPct = (v: number) => formatPercent(v);

  if (!store) {
    return {
      rows: [],
      stats: buildStats([], currency, fmt, fmtPct),
      storeName: "",
      periodLabel: period.label,
      currency,
    };
  }

  const orders = await Order.find({
    workspaceId: wsId,
    storeId: store._id,
    ...(storeTz
      ? orderDateMatchInTimezone(period, storeTz)
      : orderDateMatch(period)),
  })
    .sort({ orderDate: -1 })
    .limit(limit)
    .select(
      "name orderDate financialStatus totalPrice subtotal netRevenue cogs shipping fees refunded manualCogs amountsBase",
    )
    .lean();

  const rows: OrderListRow[] = orders.map((o) => {
    const profit = orderProfitBase(o);
    const refunded = orderRefundedBase(o);
    return {
      id: String(o._id),
      name: o.name ?? "—",
      orderDateLabel: o.orderDate
        ? new Date(o.orderDate).toLocaleDateString("pt-PT", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—",
      financialStatusLabel: statusLabel(o.financialStatus),
      revenueFmt: fmt(orderNetRevenueBase(o)),
      profitFmt: fmt(profit),
      refundedFmt: fmt(refunded),
      positive: profit >= 0,
      hasRefund: refunded > 0,
    };
  });

  return {
    rows,
    stats: buildStats(orders, currency, fmt, fmtPct),
    storeName: store.name,
    periodLabel: period.label,
    currency,
  };
}

/** Encomendas com reembolso no período + refund rate agregado. */
export async function listStoreRefunds(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess">,
  storeId: string,
  periodInput?: PeriodInput,
  limit = 100,
): Promise<ListResult> {
  const { period, wsId, store, currency, storeTz } = await resolveStoreContext(
    user,
    storeId,
    periodInput,
  );
  const { formatCurrency, formatPercent } = await import("@/lib/utils");
  const fmt = (v: number) => formatCurrency(v, currency);
  const fmtPct = (v: number) => formatPercent(v);

  if (!store) {
    return {
      rows: [],
      stats: buildStats([], currency, fmt, fmtPct),
      storeName: "",
      periodLabel: period.label,
      currency,
    };
  }

  const [allInPeriod, refundedOrders] = await Promise.all([
    Order.find({
      workspaceId: wsId,
      storeId: store._id,
      ...(storeTz
      ? orderDateMatchInTimezone(period, storeTz)
      : orderDateMatch(period)),
    })
      .select(
        "totalPrice subtotal netRevenue refunded amountsBase",
      )
      .lean(),
    Order.find({
      workspaceId: wsId,
      storeId: store._id,
      ...(storeTz
      ? orderDateMatchInTimezone(period, storeTz)
      : orderDateMatch(period)),
      refunded: { $gt: 0 },
    })
      .sort({ orderDate: -1 })
      .limit(limit)
      .select(
        "name orderDate financialStatus totalPrice subtotal netRevenue cogs shipping fees refunded manualCogs amountsBase",
      )
      .lean(),
  ]);

  const rows: OrderListRow[] = refundedOrders.map((o) => {
    const profit = orderProfitBase(o);
    const refunded = orderRefundedBase(o);
    return {
      id: String(o._id),
      name: o.name ?? "—",
      orderDateLabel: o.orderDate
        ? new Date(o.orderDate).toLocaleDateString("pt-PT", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "—",
      financialStatusLabel: statusLabel(o.financialStatus),
      revenueFmt: fmt(orderNetRevenueBase(o)),
      profitFmt: fmt(profit),
      refundedFmt: fmt(refunded),
      positive: profit >= 0,
      hasRefund: true,
    };
  });

  return {
    rows,
    stats: buildStats(allInPeriod, currency, fmt, fmtPct),
    storeName: store.name,
    periodLabel: period.label,
    currency,
  };
}
