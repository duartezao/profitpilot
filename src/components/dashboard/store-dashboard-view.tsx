import { Calendar, Store } from "lucide-react";
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
    <div className="space-y-6">
      <DashboardKpiSection
        kpis={data.kpis}
        extendedKpis={data.extendedKpis}
        funnelError={dashboard?.funnelError}
        sessionCountryLabel={dashboard?.sessionCountryLabel}
        variant="store"
        emphasizeLabel="Net Profit"
      />

      {dashboard && (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <section className="rounded-lg border border-border bg-surface p-4 sm:p-5 lg:col-span-2">
            <div>
              <h2 className="text-lg font-semibold">Para onde vai o dinheiro</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Waterfall do período: receita líquida, custos e lucro final.
              </p>
            </div>
            <WaterfallChart steps={dashboard.waterfall} />
          </section>

          <CostBreakdownPanel data={data.costBreakdown} />
        </div>
      )}

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div>
            <h2 className="text-lg font-semibold">Produtos</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {productsDescription}
            </p>
          </div>
          {data.topProducts.length > 0 && (
            <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {data.topProducts.length}
            </span>
          )}
        </div>
        <ProductsProfitTable
          products={data.topProducts}
          mode={data.topProductsMode}
          embedded
        />
      </section>
    </div>
  );
}

export function StoreDashboardHeader({
  title,
  periodLabel,
  prevPeriodLabel,
}: {
  title: string;
  periodLabel?: string;
  prevPeriodLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <Store className="h-5 w-5 shrink-0 text-muted-foreground" />
        <Sensitive as="h1" className="truncate text-2xl font-semibold tracking-tight">
          {title}
        </Sensitive>
      </div>

      {periodLabel && (
        <div
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
          title={prevPeriodLabel ? `Comparado com ${prevPeriodLabel}` : undefined}
        >
          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="tabular-nums">{periodLabel}</span>
        </div>
      )}
    </div>
  );
}
