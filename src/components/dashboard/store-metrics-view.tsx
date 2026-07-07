"use client";

import { useState } from "react";
import type { DashboardSummary } from "@/lib/metrics";
import { DashboardKpiSection } from "@/components/dashboard/dashboard-kpi-section";
import { ProfitChart } from "@/components/dashboard/profit-chart";
import { StoreDailyMetricsTable } from "@/components/dashboard/store-daily-metrics-table";
import { PageTabCard, PageTabs } from "@/components/page-tabs";

export function StoreMetricsView({
  data,
  storeId,
  orderedMetricIds,
}: {
  data: DashboardSummary;
  storeId: string;
  orderedMetricIds?: string[];
}) {
  const dashboard = data.storeDashboard;
  const [tab, setTab] = useState<"lucro" | "dias">("lucro");

  return (
    <div className="space-y-5">
      <DashboardKpiSection
        kpis={data.kpis}
        extendedKpis={data.extendedKpis}
        funnelError={dashboard?.funnelError}
        sessionCountryLabel={dashboard?.sessionCountryLabel}
        variant="store"
        orderedMetricIds={orderedMetricIds}
      />

      <PageTabs
        tabs={[
          { id: "lucro", label: "Lucro por dia" },
          {
            id: "dias",
            label: "Métricas por dia",
            badge: (
              <span className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {data.dailyMetrics.length}
              </span>
            ),
          },
        ]}
        active={tab}
        onChange={(id) => setTab(id as "lucro" | "dias")}
        ariaLabel="Secções da dashboard"
      />

      {tab === "lucro" && (
        <PageTabCard>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Lucro por dia</h2>
            <p className="text-sm text-muted-foreground">
              {dashboard?.periodLabel ?? "Período seleccionado"}
              {data.profitWindowStatus !== "consolidated" && (
                <span className="mt-1 block text-xs">{data.profitWindowNote}</span>
              )}
            </p>
          </div>
          <ProfitChart data={data.profitChart} />
        </PageTabCard>
      )}

      {tab === "dias" && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Métricas por dia</h2>
            <p className="text-sm text-muted-foreground">
              Passa o rato no Net Profit para o breakdown.
            </p>
          </div>
          <StoreDailyMetricsTable
            rows={data.dailyMetrics}
            storeUrl={data.scopeDomain}
            storeId={storeId}
          />
        </div>
      )}
    </div>
  );
}
