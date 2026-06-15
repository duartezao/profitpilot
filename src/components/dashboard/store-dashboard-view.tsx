import { Calendar, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/privacy-mode";
import type { DashboardSummary } from "@/lib/metrics";
import { StoreKpiCard } from "@/components/dashboard/store-kpi-card";
import { WaterfallChart } from "@/components/dashboard/waterfall-chart";
import { PayoutPreviewCard } from "@/components/dashboard/payout-preview-card";
import { StoreDailyNotes } from "@/components/dashboard/store-daily-notes";
import { ProductsProfitTable } from "@/components/dashboard/products-profit-table";

export function StoreDashboardView({ data }: { data: DashboardSummary }) {
  const dashboard = data.storeDashboard;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {data.kpis.map((k) => (
          <StoreKpiCard key={k.label} {...k} />
        ))}
      </div>

      {dashboard && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-5 lg:col-span-2">
            <h2 className="text-lg font-semibold">Para onde vai o dinheiro</h2>
            <WaterfallChart steps={dashboard.waterfall} />
          </div>
          <PayoutPreviewCard payout={dashboard.payout} />
        </div>
      )}

      {dashboard && (
        <StoreDailyNotes
          notes={dashboard.dailyNotes}
          periodIsSingleDay={dashboard.periodIsSingleDay}
          periodLabel={dashboard.periodLabel}
        />
      )}

      <ProductsProfitTable products={data.topProducts} />
    </div>
  );
}

export function StoreDashboardHeader({
  title,
  periodLabel,
  prevPeriodLabel,
  isFetching,
  updatedAt,
}: {
  title: string;
  periodLabel?: string;
  prevPeriodLabel?: string;
  isFetching: boolean;
  updatedAt: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <Store className="h-5 w-5 shrink-0 text-muted-foreground" />
        <Sensitive as="h1" className="truncate text-2xl font-semibold tracking-tight">
          {title}
        </Sensitive>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {periodLabel && (
          <div
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm"
            title={prevPeriodLabel ? `Comparado com ${prevPeriodLabel}` : undefined}
          >
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="tabular-nums">{periodLabel}</span>
          </div>
        )}
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full bg-positive opacity-75",
                isFetching ? "animate-ping" : "hidden",
              )}
            />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
          </span>
          <span className="tabular-nums">
            {updatedAt ? `Ao vivo · ${updatedAt}` : "A ligar…"}
          </span>
        </span>
      </div>
    </div>
  );
}
