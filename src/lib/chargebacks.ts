import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Dispute } from "@/models/Dispute";
import { Order } from "@/models/Order";
import { Workspace } from "@/models/Workspace";
import type { CurrentUser } from "@/lib/auth";
import { findStoreForUser } from "@/lib/store-scope";
import {
  resolvePeriod,
  orderDateMatch,
  type PeriodInput,
} from "@/lib/period";
import {
  resolvePeriodForStore,
  orderDateMatchInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import { convertToBaseCurrency } from "@/lib/fx";
import { formatCurrency, formatPercent } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  needs_response: "Resposta necessária",
  under_review: "Em análise",
  charge_refunded: "Reembolsado",
  accepted: "Aceite",
  won: "Ganho",
  lost: "Perdido",
};

function normStatus(s?: string | null): string {
  return (s ?? "").toLowerCase().replace(/-/g, "_");
}

function statusLabel(s?: string | null): string {
  const key = normStatus(s);
  return STATUS_LABELS[key] ?? (s || "—");
}

export type ChargebackListRow = {
  id: string;
  orderName: string;
  initiatedAtLabel: string;
  statusLabel: string;
  reason: string;
  amountFmt: string;
  amountBaseFmt: string;
};

export type ChargebackStats = {
  count: number;
  totalAmount: number;
  totalAmountFmt: string;
  chargebackRate: number;
  chargebackRateFmt: string;
  ordersInPeriod: number;
};

type ListResult = {
  rows: ChargebackListRow[];
  stats: ChargebackStats;
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
  const workspace = await Workspace.findById(wsId).lean();
  const currency =
    workspace?.baseCurrency ?? store?.currency ?? "EUR";

  return { period, wsId, store, currency, storeTz };
}

function disputeDateMatch(
  period: Awaited<ReturnType<typeof resolvePeriod>>,
  storeTz: string | null,
): Record<string, unknown> {
  if (storeTz) {
    const orderMatch = orderDateMatchInTimezone(period, storeTz);
    if ("orderDate" in orderMatch) {
      return { initiatedAt: orderMatch.orderDate };
    }
  }
  return {
    initiatedAt: {
      $gte: period.start,
      $lte: period.end,
    },
  };
}

export async function listStoreChargebacks(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess">,
  storeId: string,
  periodInput?: PeriodInput,
  limit = 100,
): Promise<ListResult> {
  const { period, wsId, store, currency, storeTz } =
    await resolveStoreContext(user, storeId, periodInput);
  const fmt = (v: number) => formatCurrency(v, currency);
  const fmtPct = (v: number) => formatPercent(v);

  if (!store) {
    return {
      rows: [],
      stats: {
        count: 0,
        totalAmount: 0,
        totalAmountFmt: fmt(0),
        chargebackRate: 0,
        chargebackRateFmt: "0%",
        ordersInPeriod: 0,
      },
      storeName: "",
      periodLabel: period.label,
      currency,
    };
  }

  const disputeMatch = {
    workspaceId: wsId,
    storeId: store._id,
    ...disputeDateMatch(period, storeTz),
  };

  const [disputes, ordersInPeriod] = await Promise.all([
    Dispute.find(disputeMatch).sort({ initiatedAt: -1 }).limit(limit).lean(),
    Order.countDocuments({
      workspaceId: wsId,
      storeId: store._id,
      ...(storeTz
        ? orderDateMatchInTimezone(period, storeTz)
        : orderDateMatch(period)),
    }),
  ]);

  const rows: ChargebackListRow[] = await Promise.all(
    disputes.map(async (d) => {
      const dateKey = d.initiatedAt
        ? d.initiatedAt.toISOString().slice(0, 10)
        : "";
      const fx = await convertToBaseCurrency(
        d.amount ?? 0,
        d.currency ?? currency,
        currency,
        dateKey,
      );
      return {
        id: String(d._id),
        orderName: d.orderName ?? "—",
        initiatedAtLabel: d.initiatedAt
          ? d.initiatedAt.toLocaleDateString("pt-PT", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—",
        statusLabel: statusLabel(d.status),
        reason: d.reason ?? "—",
        amountFmt: formatCurrency(d.amount ?? 0, d.currency ?? currency),
        amountBaseFmt: fmt(fx.amountBase),
      };
    }),
  );

  let totalBase = 0;
  for (const d of disputes) {
    const dateKey = d.initiatedAt
      ? d.initiatedAt.toISOString().slice(0, 10)
      : "";
    const fx = await convertToBaseCurrency(
      d.amount ?? 0,
      d.currency ?? currency,
      currency,
      dateKey,
    );
    totalBase += fx.amountBase;
  }

  const chargebackRate =
    ordersInPeriod > 0 ? (disputes.length / ordersInPeriod) * 100 : 0;

  return {
    rows,
    stats: {
      count: disputes.length,
      totalAmount: totalBase,
      totalAmountFmt: fmt(totalBase),
      chargebackRate,
      chargebackRateFmt: fmtPct(chargebackRate),
      ordersInPeriod,
    },
    storeName: store.name,
    periodLabel: period.label,
    currency,
  };
}

export type ChargebackExportRow = {
  orderName: string;
  initiatedAtIso: string;
  status: string;
  type: string;
  reason: string;
  amount: number;
  currency: string;
  amountBase: number;
};

export async function listStoreChargebacksForExport(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess">,
  storeId: string,
  periodInput?: PeriodInput,
  limit = 5000,
): Promise<{
  rows: ChargebackExportRow[];
  storeName: string;
  periodLabel: string;
  currency: string;
} | null> {
  const { period, wsId, store, currency, storeTz } =
    await resolveStoreContext(user, storeId, periodInput);
  if (!store) return null;

  const disputeMatch = {
    workspaceId: wsId,
    storeId: store._id,
    ...disputeDateMatch(period, storeTz),
  };

  const disputes = await Dispute.find(disputeMatch)
    .sort({ initiatedAt: -1 })
    .limit(limit)
    .lean();

  const rows: ChargebackExportRow[] = await Promise.all(
    disputes.map(async (d) => {
      const dateKey = d.initiatedAt
        ? d.initiatedAt.toISOString().slice(0, 10)
        : "";
      const fx = await convertToBaseCurrency(
        d.amount ?? 0,
        d.currency ?? currency,
        currency,
        dateKey,
      );
      return {
        orderName: d.orderName ?? "—",
        initiatedAtIso: d.initiatedAt
          ? d.initiatedAt.toISOString()
          : "",
        status: normStatus(d.status),
        type: d.type ?? "",
        reason: d.reason ?? "",
        amount: d.amount ?? 0,
        currency: d.currency ?? currency,
        amountBase: fx.amountBase,
      };
    }),
  );

  return {
    rows,
    storeName: store.name,
    periodLabel: period.label,
    currency,
  };
}
