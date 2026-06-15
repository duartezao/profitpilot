import { Calendar, Store } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import type { DashboardSummary } from "@/lib/metrics";
import { DashboardKpiSection } from "@/components/dashboard/dashboard-kpi-section";
import { WaterfallChart } from "@/components/dashboard/waterfall-chart";
import { PayoutPreviewCard } from "@/components/dashboard/payout-preview-card";
import { ProductsProfitTable } from "@/components/dashboard/products-profit-table";

export function StoreDashboardView({ data }: { data: DashboardSummary }) {
  const dashboard = data.storeDashboard;

  return (
    <div className="space-y-6">
      <DashboardKpiSection kpis={data.kpis} variant="store" />

      {dashboard && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-5 lg:col-span-2">
            <h2 className="text-lg font-semibold">Para onde vai o dinheiro</h2>
            <WaterfallChart steps={dashboard.waterfall} />
          </div>
          <PayoutPreviewCard payout={dashboard.payout} />
        </div>
      )}

      <ProductsProfitTable
        products={data.topProducts}
        mode={data.topProductsMode}
      />
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
