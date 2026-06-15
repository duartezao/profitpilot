import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { resolvePeriod, orderDateMatch, type PeriodInput } from "@/lib/period";
import {
  resolvePeriodForStore,
  orderDateMatchInTimezone,
  normalizeStoreTimezone,
  dateKeyInTimezone,
} from "@/lib/store-timezone";
import { orderNetRevenue } from "@/lib/order-revenue";
import { Order } from "@/models/Order";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";

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

function orderProfit(o: {
  subtotal?: number | null;
  totalPrice?: number | null;
  refunded?: number | null;
  cogs?: number | null;
  shipping?: number | null;
  fees?: number | null;
}) {
  const revenue = orderNetRevenue(o);
  return revenue - (o.cogs ?? 0) - (o.shipping ?? 0) - (o.fees ?? 0);
}

type ListResult = {
  rows: OrderListRow[];
  stats: OrderListStats;
  storeName: string;
  periodLabel: string;
  currency: string;
};

async function resolveStoreContext(
  workspaceId: string,
  storeId: string,
  periodInput?: PeriodInput,
) {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const store = await Store.findOne({
    _id: storeId,
    workspaceId: wsId,
    deletedAt: null,
  })
    .select("name currency ianaTimezone")
    .lean();
  const storeTz = store
    ? normalizeStoreTimezone(store.ianaTimezone)
    : null;
  const period = storeTz
    ? resolvePeriodForStore(periodInput, storeTz)
    : resolvePeriod(periodInput);
  const workspace = await Workspace.findById(wsId).lean();
  const currency =
    workspace?.baseCurrency ?? store?.currency ?? "EUR";

  return { period, wsId, store, currency, storeTz };
}

function buildStats(
  orders: Array<{
    subtotal?: number | null;
    totalPrice?: number | null;
    refunded?: number | null;
  }>,
  currency: string,
  fmt: (v: number) => string,
  fmtPct: (v: number) => string,
): OrderListStats {
  const count = orders.length;
  const revenue = orders.reduce((s, o) => s + orderNetRevenue(o), 0);
  const refunded = orders.reduce((s, o) => s + (o.refunded ?? 0), 0);
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
  workspaceId: string,
  storeId: string,
  periodInput?: PeriodInput,
  limit = 100,
): Promise<ListResult> {
  const { period, wsId, store, currency, storeTz } = await resolveStoreContext(
    workspaceId,
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
      "name orderDate financialStatus totalPrice subtotal cogs shipping fees refunded",
    )
    .lean();

  const rows: OrderListRow[] = orders.map((o) => {
    const profit = orderProfit(o);
    const refunded = o.refunded ?? 0;
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
      revenueFmt: fmt(orderNetRevenue(o)),
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
  workspaceId: string,
  storeId: string,
  periodInput?: PeriodInput,
  limit = 100,
): Promise<ListResult> {
  const { period, wsId, store, currency, storeTz } = await resolveStoreContext(
    workspaceId,
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
      .select("totalPrice refunded")
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
        "name orderDate financialStatus totalPrice subtotal cogs shipping fees refunded",
      )
      .lean(),
  ]);

  const rows: OrderListRow[] = refundedOrders.map((o) => {
    const profit = orderProfit(o);
    const refunded = o.refunded ?? 0;
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
      revenueFmt: fmt(orderNetRevenue(o)),
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
