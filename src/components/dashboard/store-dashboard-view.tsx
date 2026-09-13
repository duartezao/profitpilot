import { Store } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import type { DashboardSummary } from "@/lib/metrics";
import { DashboardKpiSection } from "@/components/dashboard/dashboard-kpi-section";
import { CostBreakdownPanel } from "@/components/dashboard/cost-breakdown-panel";
import { WaterfallChart } from "@/components/dashboard/waterfall-chart";
import { ProductsProfitTable } from "@/components/dashboard/products-profit-table";

export function StoreDashboardView({ data }: { data: DashboardSummary }) {
  const dashboard = data.storeDashboard;
  const productsDescription =
    data.topProductsMode === "units"
      ? "Ranking por unidades vendidas."
      : "Ranking por lucro real.";

  return (
    <div className="space-y-4">
      <DashboardKpiSection
        kpis={data.kpis}
        extendedKpis={data.extendedKpis}
        funnelError={dashboard?.funnelError}
        sessionCountryLabel={dashboard?.sessionCountryLabel}
        variant="store"
        emphasizeLabel="Net Profit"
      />

      {dashboard && (
        <div className="grid items-start gap-4 lg:grid-cols-3 lg:gap-6">
          <section className="min-w-0 lg:col-span-2">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">Para onde vai o dinheiro</h2>
            </div>
            <WaterfallChart steps={dashboard.waterfall} />
          </section>

          <CostBreakdownPanel data={data.costBreakdown} />
        </div>
      )}

      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Produtos</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {productsDescription}
            </p>
          </div>
          {data.topProducts.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {data.topProducts.length}
            </span>
          )}
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <ProductsProfitTable
            products={data.topProducts}
            mode={data.topProductsMode}
            embedded
          />
        </div>
      </section>
    </div>
  );
}

export function StoreDashboardHeader({
  title,
  actions,
}: {
  title: string;
  /** @deprecated Período já está na topbar — mantido por compatibilidade. */
  periodLabel?: string;
  prevPeriodLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Store className="h-5 w-5 shrink-0 text-muted-foreground" />
        <Sensitive as="h1" className="truncate text-2xl font-semibold tracking-tight">
          {title}
        </Sensitive>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}
