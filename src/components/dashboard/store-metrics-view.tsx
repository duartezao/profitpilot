import type { DashboardSummary } from "@/lib/metrics";
import { DashboardKpiSection } from "@/components/dashboard/dashboard-kpi-section";
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
        showExtended
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
            Um cartão por dia do período na topbar. Passa o rato sobre o Net
            Profit para ver REV − COGS − taxas − ads. O número grande no KPI é
            euros; a % por baixo é só comparação com o período anterior.
            {dashboard?.sessionCountryLabel && (
              <>
                {" "}
                Sessões:{" "}
                <span data-sensitive>{dashboard.sessionCountryLabel}</span>.
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
