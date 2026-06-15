import type { DashboardSummary } from "@/lib/metrics";
import { DashboardKpiSection } from "@/components/dashboard/dashboard-kpi-section";
import { Sensitive } from "@/components/privacy-mode";
import { ProfitChart } from "@/components/dashboard/profit-chart";
import { StoreDailyMetricsTable } from "@/components/dashboard/store-daily-metrics-table";

export function StoreMetricsView({
  data,
  storeId,
}: {
  data: DashboardSummary;
  storeId: string;
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
      />

      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Lucro por dia</h2>
        <p className="text-sm text-muted-foreground">
          Evolução no período selecionado
          {dashboard?.periodLabel ? ` · ${dashboard.periodLabel}` : ""}.
        </p>
        <ProfitChart data={data.profitChart} />
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Métricas por dia</h2>
          <p className="text-sm text-muted-foreground">
            Um cartão por dia do período selecionado na topbar. Net Profit = REV
            − COGS − envio − taxas − ad spend.
            {dashboard?.sessionCountryLabel && (
              <>
                {" "}
                Sessões:{" "}
                <Sensitive as="span">{dashboard.sessionCountryLabel}</Sensitive>.
              </>
            )}
          </p>
        </div>
        <StoreDailyMetricsTable
          rows={data.dailyMetrics}
          storeUrl={data.scopeDomain}
          storeId={storeId}
        />
      </div>
    </div>
  );
}
