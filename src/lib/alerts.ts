import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { DailyMetric } from "@/models/DailyMetric";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { Order } from "@/models/Order";
import { Dispute } from "@/models/Dispute";
import { AdAccount } from "@/models/AdAccount";
import {
  buildStoreAdSpendSummaries,
} from "@/lib/ad-spend";
import {
  countMissingCogsForStore,
  cogsMissingLabel,
} from "@/lib/manual-cogs";
import { type CogsMode } from "@/lib/cogs-modes";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import {
  canAccessStore,
  type StoreAccess,
} from "@/lib/store-access";
import {
  resolvePeriod,
  formatDateInput,
  addDays,
  startOfDay,
} from "@/lib/period";
import { fetchStoreDayFinancials } from "@/lib/metrics";
import { mergePaidOrderFilter } from "@/lib/order-financial-status";
import { scopeQueryFromInput } from "@/lib/scope-query";
import { formatCurrency } from "@/lib/utils";
import {
  netRevenueSumBaseExpr,
  shippingSumBaseExpr,
  feesSumBaseExpr,
  refundsSumBaseExpr,
  cogsSumExprForMode,
} from "@/lib/order-money";
import { calcNetProfit, calcPoas } from "@/lib/profit";
import { sumAdSpendForPeriod } from "@/lib/ad-spend";
import {
  normalizeStoreTimezone,
  orderDateMatchInTimezone,
} from "@/lib/store-timezone";
import { orderDateMatch } from "@/lib/period";

export type AlertSeverity = "critical" | "warning" | "info";

export type WorkspaceAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  href?: string;
  storeId?: string;
  storeName?: string;
};

type AlertUser = {
  workspaceId: string;
  storeAccess: StoreAccess;
};

export async function buildWorkspaceAlerts(
  user: AlertUser,
  opts?: { storeId?: string },
): Promise<WorkspaceAlert[]> {
  await connectToDatabase();
  const alerts: WorkspaceAlert[] = [];
  const wsId = new mongoose.Types.ObjectId(user.workspaceId);

  if (opts?.storeId && !canAccessStore(user.storeAccess, opts.storeId)) {
    return [];
  }

  const storeQuery = activeStoreQueryForUser(user);
  if (opts?.storeId) storeQuery._id = opts.storeId;

  const stores = await Store.find(storeQuery)
    .select(
      "name workspaceId cogsMode lastSyncError lastSessionMetricsError payoutsError importStartDate createdAt ianaTimezone",
    )
    .lean();

  const workspace = await Workspace.findById(wsId)
    .select("baseCurrency targets")
    .lean();
  const currency = workspace?.baseCurrency ?? "EUR";
  const chargebackRateMax = workspace?.targets?.chargebackRateMax ?? 1;
  const netMarginMin = workspace?.targets?.netMarginMin ?? 15;
  const refundRateMax = workspace?.targets?.refundRateMax ?? 5;
  const poasMin = workspace?.targets?.poasMin ?? 1;

  for (const store of stores) {
    const sid = String(store._id);
    const qs = scopeQueryFromInput({ store: sid });

    if (store.lastSyncError) {
      alerts.push({
        id: `sync-${sid}`,
        severity: "critical",
        title: "Falha na sincronização",
        description: store.lastSyncError,
        href: `/lojas?${qs}`,
        storeId: sid,
        storeName: store.name,
      });
    }

    if (store.lastSessionMetricsError) {
      alerts.push({
        id: `sessions-${sid}`,
        severity: "warning",
        title: "Sessões / funil em falta",
        description: store.lastSessionMetricsError,
        href: `/definicoes?${qs}`,
        storeId: sid,
        storeName: store.name,
      });
    }

    if (store.payoutsError) {
      alerts.push({
        id: `payouts-${sid}`,
        severity: "warning",
        title: "Payouts não sincronizados",
        description: store.payoutsError,
        href: `/payouts?${qs}`,
        storeId: sid,
        storeName: store.name,
      });
    }
  }

  const adSummaries = await buildStoreAdSpendSummaries(stores, currency);
  for (const summary of adSummaries) {
    if (summary.missingCount > 0) {
      const qs = scopeQueryFromInput({ store: summary.storeId });
      alerts.push({
        id: `adspend-${summary.storeId}`,
        severity: "warning",
        title: "Ad spend em falta",
        description: `${summary.missingCount} ${summary.missingCount === 1 ? "dia sem valor" : "dias sem valor"} registado${summary.missingCount === 1 ? "" : "s"}.`,
        href: `/anuncios?${qs}`,
        storeId: summary.storeId,
        storeName: summary.storeName,
      });
    }
  }

  const period = resolvePeriod({ period: "last_30_days" });
  for (const store of stores) {
    const sid = String(store._id);
    const cogsMode = (store.cogsMode ?? "shopify") as CogsMode;
    const missingCogs = await countMissingCogsForStore(store, {
      start: period.start,
      end: period.end,
      specificDates: period.specificDates,
    });
    if (missingCogs > 0) {
      const qs = scopeQueryFromInput({ store: sid });
      const detail = cogsMissingLabel(cogsMode, missingCogs);
      alerts.push({
        id: `cogs-${sid}`,
        severity: "warning",
        title: "COGS incompletos",
        description: `${detail}${cogsMode === "shopify" || cogsMode === "variant" ? " nos últimos 30 dias" : ""} — o lucro pode estar superestimado.`,
        href: `/cogs?${qs}`,
        storeId: sid,
        storeName: store.name,
      });
    }
  }

  const yesterdayKey = formatDateInput(addDays(startOfDay(new Date()), -1));
  for (const store of stores) {
    const sid = String(store._id);
    const financials = await fetchStoreDayFinancials(
      user.workspaceId,
      sid,
      yesterdayKey,
    );
    if (financials && financials.profit < 0 && financials.revenue > 0) {
      const qs = scopeQueryFromInput({
        store: sid,
        period: "yesterday",
      });
      alerts.push({
        id: `loss-${sid}-${yesterdayKey}`,
        severity: "info",
        title: "Lucro negativo ontem",
        description: `Net Profit abaixo de zero no dia ${yesterdayKey.split("-").reverse().join("/")}.`,
        href: `/metricas?${qs}`,
        storeId: sid,
        storeName: store.name,
      });
    }
  }

  const period30 = resolvePeriod({ period: "last_30_days" });
  for (const store of stores) {
    const sid = String(store._id);
    const storeOid = store._id;
    const orders30 = await Order.countDocuments(
      mergePaidOrderFilter({
        workspaceId: wsId,
        storeId: storeOid,
        orderDate: { $gte: period30.start, $lte: period30.end },
      }),
    );
    const disputes30 = await Dispute.countDocuments({
      workspaceId: wsId,
      storeId: storeOid,
      initiatedAt: { $gte: period30.start, $lte: period30.end },
    });
    if (orders30 === 0) continue;
    const rate = (disputes30 / orders30) * 100;
    if (rate >= chargebackRateMax * 0.75) {
      const qs = scopeQueryFromInput({ store: sid, period: "last_30_days" });
      const severity: AlertSeverity =
        rate >= chargebackRateMax ? "critical" : "warning";
      alerts.push({
        id: `chargeback-${sid}`,
        severity,
        title:
          rate >= chargebackRateMax
            ? "Chargeback rate acima do limite"
            : "Chargeback rate elevado",
        description: `${rate.toFixed(2).replace(".", ",")}% nos últimos 30 dias (meta: ≤ ${chargebackRateMax.toFixed(2).replace(".", ",")}%). ${disputes30} disputa${disputes30 === 1 ? "" : "s"} em ${orders30} encomendas.`,
        href: `/chargebacks?${qs}`,
        storeId: sid,
        storeName: store.name,
      });
    }
  }

  const adAccountErrors = await AdAccount.find({
    workspaceId: wsId,
    deletedAt: null,
    status: "error",
    ...(opts?.storeId ? { storeId: opts.storeId } : {}),
  })
    .select("storeId platform externalAccountId accountName lastSyncError")
    .lean();

  for (const acc of adAccountErrors) {
    const sid = String(acc.storeId);
    if (!canAccessStore(user.storeAccess, sid)) continue;
    const store = stores.find((s) => String(s._id) === sid);
    if (!store) continue;
    const qs = scopeQueryFromInput({ store: sid });
    alerts.push({
      id: `adaccount-${String(acc._id)}`,
      severity: "warning",
      title: "Conta de ads com erro",
      description:
        acc.lastSyncError ??
        "A sincronização de ad spend falhou — verifica o token Meta.",
      href: `/anuncios?${qs}#contas-ads`,
      storeId: sid,
      storeName: store.name,
    });
  }

  const healthSlice = {
    start: period30.start,
    end: period30.end,
    specificDates: period30.specificDates,
  };

  for (const store of stores) {
    const sid = String(store._id);
    const storeTz = normalizeStoreTimezone(
      (store as { ianaTimezone?: string | null }).ianaTimezone,
    );
    const dateMatch = storeTz
      ? orderDateMatchInTimezone(healthSlice, storeTz)
      : orderDateMatch(healthSlice);

    const cogsMode = (store.cogsMode ?? "shopify") as CogsMode;

    const [agg] = await Order.aggregate<{
      revenue: number;
      cogs: number;
      shipping: number;
      fees: number;
      refunds: number;
    }>([
      {
        $match: mergePaidOrderFilter({
          workspaceId: wsId,
          storeId: store._id,
          ...dateMatch,
        }),
      },
      {
        $group: {
          _id: null,
          revenue: netRevenueSumBaseExpr,
          cogs: cogsSumExprForMode(cogsMode),
          shipping: shippingSumBaseExpr,
          fees: feesSumBaseExpr,
          refunds: refundsSumBaseExpr,
        },
      },
    ]);

    const row = agg ?? {
      revenue: 0,
      cogs: 0,
      shipping: 0,
      fees: 0,
      refunds: 0,
    };
    if (row.revenue <= 0) continue;

    const adSpend = await sumAdSpendForPeriod(
      [store._id],
      healthSlice,
      storeTz,
    );
    const profit = calcNetProfit(row, adSpend);
    const margin = (profit / row.revenue) * 100;
    const refundRate = (row.refunds / row.revenue) * 100;
    const poas = adSpend > 0 ? calcPoas(profit, adSpend) : null;
    const qs = scopeQueryFromInput({ store: sid, period: "last_30_days" });

    if (margin < netMarginMin * 0.75) {
      const severity: AlertSeverity =
        margin < netMarginMin ? "critical" : "warning";
      alerts.push({
        id: `margin-${sid}`,
        severity,
        title:
          margin < netMarginMin
            ? "Margem abaixo do mínimo"
            : "Margem baixa",
        description: `${margin.toFixed(1).replace(".", ",")}% nos últimos 30 dias (meta: ≥ ${netMarginMin.toFixed(1).replace(".", ",")}%).`,
        href: `/metricas?${qs}`,
        storeId: sid,
        storeName: store.name,
      });
    }

    if (refundRate >= refundRateMax * 0.75) {
      const severity: AlertSeverity =
        refundRate >= refundRateMax ? "critical" : "warning";
      alerts.push({
        id: `refund-${sid}`,
        severity,
        title:
          refundRate >= refundRateMax
            ? "Refund rate acima do limite"
            : "Refund rate elevado",
        description: `${refundRate.toFixed(2).replace(".", ",")}% nos últimos 30 dias (meta: ≤ ${refundRateMax.toFixed(2).replace(".", ",")}%).`,
        href: `/reembolsos?${qs}`,
        storeId: sid,
        storeName: store.name,
      });
    }

    if (poas != null && poas < poasMin * 0.75) {
      const severity: AlertSeverity =
        poas < poasMin ? "critical" : "warning";
      alerts.push({
        id: `poas-${sid}`,
        severity,
        title: poas < poasMin ? "POAS abaixo do mínimo" : "POAS baixo",
        description: `${poas.toFixed(2).replace(".", ",")} nos últimos 30 dias (meta: ≥ ${poasMin.toFixed(2).replace(".", ",")}).`,
        href: `/metricas?${qs}`,
        storeId: sid,
        storeName: store.name,
      });
    }
  }

  // Anomalias: ontem vs média dos 7 dias anteriores (snapshots).
  const weekStartKey = formatDateInput(addDays(startOfDay(new Date()), -8));

  for (const store of stores) {
    const sid = String(store._id);
    const snapRows = await DailyMetric.find({
      storeId: store._id,
      dateKey: { $gte: weekStartKey, $lte: yesterdayKey },
    })
      .select("dateKey revenue netProfit")
      .lean();

    const yesterday = snapRows.find((r) => r.dateKey === yesterdayKey);
    const prior = snapRows.filter((r) => r.dateKey < yesterdayKey);
    if (!yesterday || prior.length < 3) continue;

    const avgRev =
      prior.reduce((s, r) => s + r.revenue, 0) / prior.length;
    const avgProfit =
      prior.reduce((s, r) => s + r.netProfit, 0) / prior.length;
    const qs = scopeQueryFromInput({ store: sid, period: "last_7_days" });

    if (avgRev > 0 && yesterday.revenue < avgRev * 0.55) {
      alerts.push({
        id: `anomaly-rev-${sid}`,
        severity: "warning",
        title: "Queda anómala de receita",
        description: `Ontem ${formatCurrency(yesterday.revenue, currency)} vs média ${formatCurrency(avgRev, currency)} nos 7 dias anteriores.`,
        href: `/metricas?${qs}`,
        storeId: sid,
        storeName: store.name,
      });
    }

    if (avgProfit !== 0 && yesterday.netProfit < avgProfit * 0.5) {
      alerts.push({
        id: `anomaly-profit-${sid}`,
        severity: yesterday.netProfit < 0 ? "critical" : "warning",
        title: "Lucro abaixo do padrão",
        description: `Ontem ${formatCurrency(yesterday.netProfit, currency)} vs média ${formatCurrency(avgProfit, currency)}.`,
        href: `/metricas?${qs}`,
        storeId: sid,
        storeName: store.name,
      });
    }
  }

  const severityOrder: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return alerts.sort((a, b) => {
    const sd = severityOrder[a.severity] - severityOrder[b.severity];
    if (sd !== 0) return sd;
    return (a.storeName ?? "").localeCompare(b.storeName ?? "", "pt");
  });
}
