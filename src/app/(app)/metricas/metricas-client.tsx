"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { ExportFormatLinks } from "@/components/export-format-links";
import { StoreMetricsView } from "@/components/dashboard/store-metrics-view";
import { StoreDashboardHeader } from "@/components/dashboard/store-dashboard-view";
import { DataWarnings } from "@/components/dashboard/data-warnings";
import { OperationsAlertsBanner } from "@/components/operations/operations-alerts-banner";
import { MetricsPanelConfig } from "@/components/dashboard/metrics-panel-config";
import { useWorkspace } from "@/components/workspace-context";
import { useMetricPanelPreferences } from "@/hooks/use-metric-panel-preferences";
import {
  periodFromSearchParams,
  periodQueryFromSearchParams,
} from "@/lib/period";
import type { MetricPanelPreferences } from "@/lib/metric-panel";
import type { DashboardSummary } from "@/lib/metrics";
import { withLiveFreshParam } from "@/lib/refresh-live-queries";
import { hrefWithScopeAndStore } from "@/lib/scope-query";

function summaryApiUrl(params: URLSearchParams): string {
  const q = new URLSearchParams(periodQueryFromSearchParams(params));
  const store = params.get("store");
  if (store) q.set("store", store);
  const qs = q.toString();
  return qs ? `/api/metrics/summary?${qs}` : "/api/metrics/summary";
}

async function fetchSummary(params: URLSearchParams): Promise<DashboardSummary> {
  const res = await fetch(withLiveFreshParam(summaryApiUrl(params)), {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Falha ao carregar os dados.");
  return res.json();
}

export function MetricasClient({
  initialPanelPrefs,
  profitSheetTemplateReady = false,
  profitSheetGoogleConnected = false,
  profitSheetCanExport = false,
  profitSheetOAuthConfigured = false,
}: {
  initialPanelPrefs?: MetricPanelPreferences;
  profitSheetTemplateReady?: boolean;
  profitSheetGoogleConnected?: boolean;
  profitSheetCanExport?: boolean;
  profitSheetOAuthConfigured?: boolean;
}) {
  const { workspaceId } = useWorkspace();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");
  const period = periodFromSearchParams(searchParams);
  const adsHref = hrefWithScopeAndStore("/anuncios", searchParams, workspaceId);
  const cogsHref = hrefWithScopeAndStore("/cogs", searchParams, workspaceId);
  const { prefs, ready, save } = useMetricPanelPreferences(
    workspaceId,
    initialPanelPrefs,
  );
  const [saving, setSaving] = useState(false);
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setClientReady(true);
  }, []);

  const { data, isError } = useQuery({
    queryKey: ["metrics-summary", workspaceId, storeId, period.key],
    queryFn: () => fetchSummary(searchParams),
    enabled: Boolean(storeId),
    placeholderData: (prev) => prev,
    refetchInterval: 60 * 1000,
  });

  const periodLabel =
    clientReady && data?.storeDashboard?.periodLabel
      ? data.storeDashboard.periodLabel
      : period.label;
  const prevPeriodLabel = clientReady
    ? data?.storeDashboard?.prevPeriodLabel
    : undefined;
  const headerTitle =
    clientReady && data
      ? (data.scopeDomain ?? data.scopeName ?? "Métricas")
      : "Métricas";

  const showLoadedContent = clientReady && Boolean(data);

  if (!storeId) {
    return (
      <div className="mx-auto max-w-7xl">
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
          Seleciona uma loja no topo para ver as métricas.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <StoreDashboardHeader
          title={headerTitle}
          periodLabel={periodLabel}
          prevPeriodLabel={prevPeriodLabel}
        />
        <div className="flex flex-wrap items-center gap-2">
          <MetricsPanelConfig
            prefs={prefs}
            saving={saving}
            onSave={async (next) => {
              setSaving(true);
              try {
                await save(next);
              } finally {
                setSaving(false);
              }
            }}
          />
          <ExportFormatLinks
            href={`/api/export/daily-metrics?store=${encodeURIComponent(storeId)}`}
          />
          {profitSheetCanExport ? (
            <a
              href={`/api/export/profit-sheet?store=${encodeURIComponent(storeId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Profit Sheet
            </a>
          ) : profitSheetTemplateReady && profitSheetOAuthConfigured && !profitSheetGoogleConnected ? (
            <a
              href={`/api/oauth/google-sheets/start?returnTo=${encodeURIComponent("/metricas")}&store=${encodeURIComponent(storeId)}`}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Ligar Google (Profit Sheet)
            </a>
          ) : (
            <span
              title={
                !profitSheetTemplateReady
                  ? "Configura PROFIT_SHEET_TEMPLATE_ID no .env e reinicia o servidor."
                  : !profitSheetOAuthConfigured
                    ? "Configura GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET no .env."
                    : "Liga o teu Gmail para exportar Profit Sheet."
              }
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
            >
              <Download className="h-4 w-4" />
              {!profitSheetTemplateReady
                ? "Profit Sheet (template em falta)"
                : !profitSheetOAuthConfigured
                  ? "Profit Sheet (OAuth em falta)"
                  : "Profit Sheet"}
            </span>
          )}
        </div>
      </div>

      {isError && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          Não foi possível carregar os dados. A tentar novamente…
        </p>
      )}

      {showLoadedContent && (
        <>
          <OperationsAlertsBanner
            exclusionNote={data!.operationContext?.exclusionNote}
            scopedStoreStatus={data!.operationContext?.scopedStoreStatus}
            collectionReminders={data!.operationContext?.collectionReminders}
          />
          <DataWarnings
            cogsIncomplete={data!.cogsIncomplete}
            missingCogsCount={data!.missingCogsCount}
            missingCogsMessage={data!.missingCogsMessage}
            missingAdSpendDays={data!.missingAdSpendDays}
            adsHref={adsHref}
            cogsHref={cogsHref}
          />
        </>
      )}

      {showLoadedContent && ready ? (
        <StoreMetricsView
          data={data!}
          storeId={storeId}
          orderedMetricIds={prefs.orderedIds}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[116px] animate-pulse rounded-lg border border-border bg-muted"
              />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-lg border border-border bg-muted" />
        </div>
      )}
    </div>
  );
}
