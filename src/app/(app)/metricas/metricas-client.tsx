"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { StoreMetricsView } from "@/components/dashboard/store-metrics-view";
import { StoreDashboardHeader } from "@/components/dashboard/store-dashboard-view";
import { DataWarnings } from "@/components/dashboard/data-warnings";
import { useWorkspace } from "@/components/workspace-context";
import {
  periodFromSearchParams,
  periodQueryFromSearchParams,
} from "@/lib/period";
import type { DashboardSummary } from "@/lib/metrics";

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

export function MetricasClient() {
  const { workspaceId } = useWorkspace();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");
  const period = periodFromSearchParams(searchParams);

  const { data, isError } = useQuery({
    queryKey: ["metrics-summary", workspaceId, storeId, period.key],
    queryFn: () => fetchSummary(searchParams),
    enabled: Boolean(storeId),
    refetchInterval: 15 * 1000,
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
      <StoreDashboardHeader
        title={headerTitle}
        periodLabel={periodLabel}
        prevPeriodLabel={prevPeriodLabel}
      />

      {isError && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          Não foi possível carregar os dados. A tentar novamente…
        </p>
      )}

      {data && (
        <DataWarnings
          cogsIncomplete={data.cogsIncomplete}
          missingCogsCount={data.missingCogsCount}
          missingAdSpendDays={data.missingAdSpendDays}
        />
      )}

      {data ? (
        <StoreMetricsView data={data} storeId={storeId} />
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
