import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
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
import { scopeQueryFromInput } from "@/lib/scope-query";

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

  const workspace = await Workspace.findById(wsId).select("baseCurrency").lean();
  const currency = workspace?.baseCurrency ?? "EUR";

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
