"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
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
import { hrefWithScope } from "@/lib/scope-query";

function summaryApiUrl(params: URLSearchParams): string {
  const q = new URLSearchParams(periodQueryFromSearchParams(params));
  const store = params.get("store");
  if (store) q.set("store", store);
  const qs = q.toString();
  return qs ? `/api/metrics/summary?${qs}` : "/api/metrics/summary";
}

async function fetchSummary(params: URLSearchParams): Promise<DashboardSummary> {
  const res = await fetch(summaryApiUrl(params), { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar os dados.");
  return res.json();
}

export function MetricasClient({
  initialPanelPrefs,
}: {
  initialPanelPrefs?: MetricPanelPreferences;
}) {
  const { workspaceId } = useWorkspace();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");
  const period = periodFromSearchParams(searchParams);
  const cogsHref = hrefWithScope("/cogs", searchParams);
  const adsHref = hrefWithScope("/anuncios", searchParams);
  const { prefs, ready, save } = useMetricPanelPreferences(
    workspaceId,
    initialPanelPrefs,
  );
  const [saving, setSaving] = useState(false);

  const { data, isError } = useQuery({
    queryKey: ["metrics-summary", workspaceId, storeId, period.key],
    queryFn: () => fetchSummary(searchParams),
    enabled: Boolean(storeId),
    placeholderData: (prev) => prev,
    refetchInterval: 60 * 1000,
  });

  const periodLabel = data?.storeDashboard?.periodLabel ?? period.label;
  const prevPeriodLabel = data?.storeDashboard?.prevPeriodLabel;
  const headerTitle = data?.scopeDomain ?? data?.scopeName ?? "Métricas";

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
        </div>
      </div>

      {isError && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          Não foi possível carregar os dados. A tentar novamente…
        </p>
      )}

      {data && (
        <>
          <OperationsAlertsBanner
            exclusionNote={data.operationContext?.exclusionNote}
            scopedStoreStatus={data.operationContext?.scopedStoreStatus}
            collectionReminders={data.operationContext?.collectionReminders}
          />
          <DataWarnings
            cogsIncomplete={data.cogsIncomplete}
            missingCogsCount={data.missingCogsCount}
            missingCogsMessage={data.missingCogsMessage}
            missingAdSpendDays={data.missingAdSpendDays}
            cogsHref={cogsHref}
            adsHref={adsHref}
          />
        </>
      )}

      {data && ready ? (
        <StoreMetricsView
          data={data}
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
