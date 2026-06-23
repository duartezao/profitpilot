import type { DashboardSummary } from "@/lib/metrics";
import { DashboardKpiSection } from "@/components/dashboard/dashboard-kpi-section";
import { ProfitChart } from "@/components/dashboard/profit-chart";
import { StoreDailyMetricsTable } from "@/components/dashboard/store-daily-metrics-table";
import { CollapsibleSection } from "@/components/collapsible-section";

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

  return (
    <div className="space-y-6">
      <DashboardKpiSection
        kpis={data.kpis}
        extendedKpis={data.extendedKpis}
        funnelError={dashboard?.funnelError}
        sessionCountryLabel={dashboard?.sessionCountryLabel}
        variant="store"
        orderedMetricIds={orderedMetricIds}
      />

      <CollapsibleSection
        title="Lucro por dia"
        description={
          <>
            {dashboard?.periodLabel ?? "Período seleccionado"}
            {data.profitWindowStatus !== "consolidated" && (
              <span className="mt-1 block text-xs">{data.profitWindowNote}</span>
            )}
          </>
        }
      >
        <ProfitChart data={data.profitChart} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Métricas por dia"
        description={`${data.dailyMetrics.length} dias · passa o rato no Net Profit para o breakdown.`}
        flush
      >
        <StoreDailyMetricsTable
          rows={data.dailyMetrics}
          storeUrl={data.scopeDomain}
          storeId={storeId}
        />
      </CollapsibleSection>
    </div>
  );
}
