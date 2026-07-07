"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ProfitChart } from "@/components/dashboard/profit-chart";
import { MonthlyGoalsCard } from "@/components/dashboard/monthly-goals-card";
import { CostBreakdownPanel } from "@/components/dashboard/cost-breakdown-panel";
import { DailyReportPanel } from "@/components/dashboard/daily-report-panel";
import { ShopifyExtraFeesLoader } from "@/components/dashboard/shopify-extra-fees-loader";
import { DataWarnings } from "@/components/dashboard/data-warnings";
import { OperationsAlertsBanner } from "@/components/operations/operations-alerts-banner";
import { DashboardKpiSection } from "@/components/dashboard/dashboard-kpi-section";
import {
  StoreDashboardView,
  StoreDashboardHeader,
} from "@/components/dashboard/store-dashboard-view";
import { StoresComparisonTable } from "@/components/dashboard/stores-comparison-table";
import { WorkspacesComparisonTable } from "@/components/dashboard/workspaces-comparison-table";
import { Sensitive } from "@/components/privacy-mode";
import { useWorkspace } from "@/components/workspace-context";
import {
  periodFromSearchParams,
  periodQueryFromSearchParams,
} from "@/lib/period";
import { parsePortfolioParam } from "@/lib/portfolio-scope";
import type { DashboardSummary } from "@/lib/metrics";
import type { PortfolioSummary } from "@/lib/portfolio-metrics";
import {
  AD_API_SYNC_INTERVAL_MS,
  LIVE_DATA_POLL_MS,
} from "@/lib/ad-sync-constants";
import { LastSyncBadge } from "@/components/last-sync-badge";

function summaryApiUrl(params: URLSearchParams): string {
  const q = new URLSearchParams(periodQueryFromSearchParams(params));
  const store = params.get("store");
  if (store) q.set("store", store);
  const qs = q.toString();
  return qs ? `/api/metrics/summary?${qs}` : "/api/metrics/summary";
}

function portfolioApiUrl(params: URLSearchParams): string {
  const q = new URLSearchParams(periodQueryFromSearchParams(params));
  const portfolio = params.get("portfolio");
  if (portfolio) q.set("portfolio", portfolio);
  return `/api/metrics/portfolio?${q.toString()}`;
}

async function fetchSummary(params: URLSearchParams): Promise<DashboardSummary> {
  const res = await fetch(summaryApiUrl(params), { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar os dados.");
  return res.json();
}

async function fetchPortfolio(
  params: URLSearchParams,
): Promise<PortfolioSummary> {
  const res = await fetch(portfolioApiUrl(params), { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar o portfolio.");
  return res.json();
}

export function DashboardClient() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");
  const portfolioParam = searchParams.get("portfolio");
  const isPortfolio = parsePortfolioParam(portfolioParam) !== null;
  const period = periodFromSearchParams(searchParams);

  const { data, isError, isFetching } = useQuery<
    DashboardSummary | PortfolioSummary
  >({
    queryKey: isPortfolio
      ? ["portfolio-summary", portfolioParam, period.key]
      : ["metrics-summary", workspaceId, storeId, period.key],
    queryFn: () =>
      isPortfolio
        ? fetchPortfolio(searchParams)
        : fetchSummary(searchParams),
    placeholderData: (prev) => prev,
    staleTime: LIVE_DATA_POLL_MS - 10_000,
    refetchInterval: LIVE_DATA_POLL_MS,
  });

  useQuery({
    queryKey: ["ad-intraday-sync", workspaceId, storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const res = await fetch(
        `/api/anuncios/sync-today?store=${encodeURIComponent(storeId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { synced?: boolean };
      if (body.synced) {
        await queryClient.invalidateQueries({
          queryKey: ["metrics-summary", workspaceId, storeId],
        });
        await queryClient.invalidateQueries({
          queryKey: ["ad-campaigns", storeId],
        });
      }
      return body;
    },
    enabled: Boolean(storeId) && !isPortfolio,
    refetchInterval: AD_API_SYNC_INTERVAL_MS,
    staleTime: AD_API_SYNC_INTERVAL_MS - 60_000,
  });

  const portfolioData =
    data && "portfolioMode" in data ? (data as PortfolioSummary) : null;
  const workspaceData =
    data && !("portfolioMode" in data) ? (data as DashboardSummary) : null;

  const isStoreView = Boolean(workspaceData?.scopeName);
  const headerTitle =
    workspaceData?.scopeDomain ?? workspaceData?.scopeName ?? "Dashboard";
  const periodLabel =
    workspaceData?.storeDashboard?.periodLabel ?? period.label;

  const lastSyncedAt =
    portfolioData?.lastSyncedAt ?? workspaceData?.lastSyncedAt ?? null;

  const liveBadge = (
    <LastSyncBadge lastSyncedAt={lastSyncedAt} fetching={isFetching} />
  );

  if (isPortfolio) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Portfolio
            </h1>
            <p className="text-sm text-muted-foreground">
              <Sensitive as="span">
                {portfolioData?.portfolioLabel ?? "Workspaces"}
              </Sensitive>
              {" · "}
              {periodLabel}
              {portfolioData?.displayCurrency
                ? ` · ${portfolioData.displayCurrency}`
                : ""}
            </p>
          </div>
          {liveBadge}
        </div>

        {isError && (
          <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            Não foi possível carregar o portfolio. A tentar novamente…
          </p>
        )}

        {portfolioData && (
          <>
            <OperationsAlertsBanner
              exclusionNote={portfolioData.operationContext?.exclusionNote}
              collectionReminders={
                portfolioData.operationContext?.collectionReminders
              }
            />
            <DataWarnings
              cogsIncomplete={portfolioData.cogsIncomplete}
              missingCogsCount={portfolioData.missingCogsCount}
              missingCogsMessage={portfolioData.missingCogsMessage}
              missingAdSpendDays={portfolioData.missingAdSpendDays}
            />
          </>
        )}

        <DashboardKpiSection
          kpis={portfolioData?.kpis ?? []}
          extendedKpis={portfolioData?.extendedKpis ?? []}
          variant="workspace"
          emphasizeLabel="Net Profit"
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4 sm:p-5 lg:col-span-2">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Lucro líquido</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Total agregado em {periodLabel}.
              </p>
              {portfolioData?.profitWindowStatus !== "consolidated" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {portfolioData?.profitWindowNote}
                </p>
              )}
            </div>
            <ProfitChart data={portfolioData?.profitChart ?? []} />
          </div>

          {portfolioData?.costBreakdown && (
            <CostBreakdownPanel data={portfolioData.costBreakdown} />
          )}
        </div>

        <WorkspacesComparisonTable
          workspaces={portfolioData?.workspaces ?? []}
          displayCurrency={portfolioData?.displayCurrency ?? "EUR"}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {isStoreView && workspaceData ? (
        <>
          <StoreDashboardHeader
            title={headerTitle}
            periodLabel={periodLabel}
            prevPeriodLabel={workspaceData.storeDashboard?.prevPeriodLabel}
          />
          {isError && (
            <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              Não foi possível carregar os dados. A tentar novamente…
            </p>
          )}
          {workspaceData && (
            <>
              <OperationsAlertsBanner
                exclusionNote={workspaceData.operationContext?.exclusionNote}
                scopedStoreStatus={
                  workspaceData.operationContext?.scopedStoreStatus
                }
                collectionReminders={
                  workspaceData.operationContext?.collectionReminders
                }
              />
              <DataWarnings
                cogsIncomplete={workspaceData.cogsIncomplete}
                missingCogsCount={workspaceData.missingCogsCount}
                missingCogsMessage={workspaceData.missingCogsMessage}
                missingAdSpendDays={workspaceData.missingAdSpendDays}
              />
              {workspaceData.monthlyGoals && (
                <MonthlyGoalsCard goals={workspaceData.monthlyGoals} />
              )}
            </>
          )}
          <StoreDashboardView data={workspaceData} />
          {storeId && <ShopifyExtraFeesLoader storeId={storeId} />}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Visão consolidada de todas as lojas · {periodLabel}
              </p>
            </div>
            {liveBadge}
          </div>

          {isError && (
            <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              Não foi possível carregar os dados. A tentar novamente…
            </p>
          )}

          {workspaceData && workspaceData.stores.length === 0 && (
            <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Este workspace ainda não tem lojas ligadas. Os valores abaixo estão
              a zero.
            </p>
          )}

          {workspaceData && (
            <>
              <OperationsAlertsBanner
                exclusionNote={workspaceData.operationContext?.exclusionNote}
                collectionReminders={
                  workspaceData.operationContext?.collectionReminders
                }
              />
              <DataWarnings
                cogsIncomplete={workspaceData.cogsIncomplete}
                missingCogsCount={workspaceData.missingCogsCount}
                missingCogsMessage={workspaceData.missingCogsMessage}
                missingAdSpendDays={workspaceData.missingAdSpendDays}
              />
            </>
          )}

          <DashboardKpiSection
            kpis={workspaceData?.kpis ?? []}
            extendedKpis={workspaceData?.extendedKpis ?? []}
            variant="workspace"
            emphasizeLabel="Net Profit"
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface p-4 sm:p-5 lg:col-span-2">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Lucro líquido</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Evolução em {periodLabel}.
                </p>
                {workspaceData?.profitWindowStatus !== "consolidated" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {workspaceData?.profitWindowNote}
                  </p>
                )}
              </div>
              <ProfitChart
                data={workspaceData?.profitChart ?? []}
                series={workspaceData?.profitChartSeries}
              />
            </div>

            {workspaceData?.costBreakdown && (
              <CostBreakdownPanel data={workspaceData.costBreakdown} />
            )}
          </div>

          {workspaceData?.monthlyGoals && (
            <MonthlyGoalsCard goals={workspaceData.monthlyGoals} />
          )}

          <StoresComparisonTable stores={workspaceData?.stores ?? []} />

          <DailyReportPanel />
        </>
      )}
    </div>
  );
}
