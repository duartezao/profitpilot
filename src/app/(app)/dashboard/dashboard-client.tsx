"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ProfitChart } from "@/components/dashboard/profit-chart";
import { DataWarnings } from "@/components/dashboard/data-warnings";
import { DashboardKpiSection } from "@/components/dashboard/dashboard-kpi-section";
import {
  StoreDashboardView,
  StoreDashboardHeader,
} from "@/components/dashboard/store-dashboard-view";
import { Sparkline } from "@/components/ui/sparkline";
import { Sensitive } from "@/components/privacy-mode";
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

export function DashboardClient() {
  const { workspaceId } = useWorkspace();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");
  const period = periodFromSearchParams(searchParams);

  const { data, isError, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["metrics-summary", workspaceId, storeId, period.key],
    queryFn: () => fetchSummary(searchParams),
    refetchInterval: 15 * 1000,
  });

  const isStoreView = Boolean(data?.scopeName);
  const headerTitle =
    data?.scopeDomain ?? data?.scopeName ?? "Dashboard";
  const periodLabel = data?.storeDashboard?.periodLabel ?? period.label;
  const prevPeriodLabel = data?.storeDashboard?.prevPeriodLabel;

  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("pt-PT")
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {isStoreView && data ? (
        <>
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
          <StoreDashboardView data={data} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Visão consolidada de todas as lojas · {periodLabel}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span
                  className={
                    isFetching
                      ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75"
                      : "hidden"
                  }
                />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
              </span>
              <span className="tabular-nums">
                {updatedAt ? `Ao vivo · ${updatedAt}` : "A ligar…"}
              </span>
            </div>
          </div>

          {isError && (
            <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              Não foi possível carregar os dados. A tentar novamente…
            </p>
          )}

          {data && data.stores.length === 0 && (
            <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Este workspace ainda não tem lojas ligadas. Os valores abaixo estão a zero.
            </p>
          )}

          {data && (
            <DataWarnings
              cogsIncomplete={data.cogsIncomplete}
              missingCogsCount={data.missingCogsCount}
              missingAdSpendDays={data.missingAdSpendDays}
            />
          )}

          <DashboardKpiSection
            kpis={data?.kpis ?? []}
            extendedKpis={data?.extendedKpis ?? []}
            variant="workspace"
          />

          <div className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold">Lucro líquido</h2>
            <p className="text-sm text-muted-foreground">
              Evolução em {periodLabel}.
            </p>
            <ProfitChart data={data?.profitChart ?? []} />
          </div>

          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border p-5">
              <h2 className="text-lg font-semibold">Lojas</h2>
              <p className="text-sm text-muted-foreground">Comparação por lucro.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted-foreground">
                    <th className="px-5 py-3">Loja</th>
                    <th className="px-5 py-3 text-right">Revenue</th>
                    <th className="px-5 py-3 text-right">Lucro</th>
                    <th className="px-5 py-3 text-right">Margem</th>
                    <th className="px-5 py-3 text-right">ROAS</th>
                    <th className="px-5 py-3 text-right">Tendência</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.stores ?? []).map((s) => (
                    <tr key={s.name} className="border-t border-border hover:bg-muted">
                      <td className="px-5 py-3 font-medium">
                        <Sensitive>{s.name}</Sensitive>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <Sensitive>{s.revenue}</Sensitive>
                      </td>
                      <td
                        className={`px-5 py-3 text-right tabular-nums ${s.positive ? "text-positive" : "text-negative"}`}
                      >
                        <Sensitive>{s.profit}</Sensitive>
                      </td>
                      <td
                        className={`px-5 py-3 text-right tabular-nums ${s.positive ? "" : "text-negative"}`}
                      >
                        <Sensitive>{s.margin}</Sensitive>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <Sensitive>{s.roas}</Sensitive>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end" data-sensitive-chart>
                          <Sparkline data={s.trend} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
