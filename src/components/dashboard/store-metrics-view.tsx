import { Globe } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import type { DashboardSummary } from "@/lib/metrics";
import { StoreKpiCard } from "@/components/dashboard/store-kpi-card";
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {data.kpis.map((k) => (
          <StoreKpiCard key={k.label} {...k} />
        ))}
      </div>

      {dashboard && dashboard.funnelKpis.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Funil Shopify
            </h2>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              <Sensitive>{dashboard.sessionCountryLabel}</Sensitive>
            </div>
          </div>
          {dashboard.funnelError && (
            <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {dashboard.funnelError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {dashboard.funnelKpis.map((k) => (
              <StoreKpiCard key={k.label} {...k} />
            ))}
          </div>
        </div>
      )}

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
