"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import { CollapsibleSection } from "@/components/collapsible-section";
import { syncAdAccountsNowAction } from "@/app/(app)/anuncios/ad-account-actions";
import type { StoreCampaignsView } from "@/lib/ad-campaign-types";
import { cn } from "@/lib/utils";
import {
  LIVE_DATA_POLL_MS,
} from "@/lib/ad-sync-constants";
import { withLiveFreshParam } from "@/lib/refresh-live-queries";
import {
  periodFromSearchParams,
  periodIncludesToday,
  periodQueryFromSearchParams,
} from "@/lib/period";

function fmtMoney(v: number, currency: string): string {
  return `${v.toFixed(2).replace(".", ",")} ${currency}`;
}

function fmtMetric(v: number | null, suffix = ""): string {
  if (v == null) return "—";
  return `${v.toFixed(2).replace(".", ",")}${suffix}`;
}

function fmtRoas(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(2).replace(".", ",")}x`;
}

function MoneyCell({
  amount,
  currency,
  inputAmount,
  inputCurrency,
  platformAmount,
}: {
  amount: number;
  currency: string;
  inputAmount?: number;
  inputCurrency?: string;
  platformAmount?: number;
}) {
  const showOrig =
    inputCurrency &&
    inputCurrency.toUpperCase() !== currency.toUpperCase() &&
    inputAmount != null &&
    inputAmount > 0;

  return (
    <>
      <Sensitive>{fmtMoney(amount, currency)}</Sensitive>
      {showOrig && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          orig. {fmtMoney(inputAmount, inputCurrency)}
          {platformAmount != null &&
            platformAmount > 0 &&
            platformAmount !== inputAmount && (
              <>
                {" "}
                · API {fmtMoney(platformAmount, inputCurrency)}
              </>
            )}
        </p>
      )}
      {!showOrig &&
        platformAmount != null &&
        platformAmount > 0 &&
        amount > platformAmount && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            API {fmtMoney(platformAmount, currency)}
          </p>
        )}
    </>
  );
}

function fmtConversions(v: number): string {
  if (v <= 0) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
}

function CampaignTotalsKpis({
  totals,
  multiDay,
}: {
  totals: StoreCampaignsView["totals"];
  multiDay: boolean;
}) {
  const clicksLabel = multiDay ? "Cliques (total)" : "Cliques";
  const items = [
    {
      label: "Gasto total",
      value: fmtMoney(totals.spend, totals.currency),
    },
    {
      label: clicksLabel,
      value: totals.clicks.toLocaleString("pt-PT"),
    },
    {
      label: "CPC médio",
      value: fmtMetric(totals.cpc, ` ${totals.currency}`),
    },
    {
      label: "CPM médio",
      value: fmtMetric(totals.cpm, ` ${totals.currency}`),
    },
    {
      label: "CTR médio",
      value: fmtMetric(totals.ctr, "%"),
    },
    {
      label: "ROAS",
      value: fmtRoas(totals.roas),
    },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-muted/20 px-3 py-2.5"
        >
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            <Sensitive>{item.value}</Sensitive>
          </p>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  const active = label === "Activa";
  const paused = label === "Pausada";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        active && "border border-positive/30 bg-positive/10 text-positive",
        paused && "border border-warning/40 bg-warning/10 text-warning",
        !active && !paused && "border border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

async function fetchCampaigns(
  storeId: string,
  periodQs: string,
  sync = false,
): Promise<StoreCampaignsView> {
  const q = new URLSearchParams(periodQs);
  q.set("store", storeId);
  if (sync) q.set("sync", "1");
  const res = await fetch(
    withLiveFreshParam(`/api/anuncios/campaigns?${q.toString()}`),
    {
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error("Falha ao carregar campanhas.");
  return res.json();
}

export function CampaignsPanel({
  storeId,
  hasLinkedAccounts,
  adApiQuotaPaused = false,
  embedded = false,
}: {
  storeId: string;
  hasLinkedAccounts: boolean;
  adApiQuotaPaused?: boolean;
  embedded?: boolean;
}) {
  const searchParams = useSearchParams();
  const period = periodFromSearchParams(searchParams);
  const periodQs = periodQueryFromSearchParams(searchParams);
  const includesToday = periodIncludesToday(period);
  const queryClient = useQueryClient();
  const [syncing, startSync] = useTransition();
  const [syncError, setSyncError] = useState<string | null>(null);

  const { data, isError, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["ad-campaigns", storeId, period.key],
    queryFn: () => fetchCampaigns(storeId, periodQs),
    enabled: hasLinkedAccounts,
    placeholderData: (prev) => prev,
    staleTime: LIVE_DATA_POLL_MS - 10_000,
    refetchInterval: includesToday ? LIVE_DATA_POLL_MS : false,
  });

  function runSync() {
    startSync(async () => {
      setSyncError(null);
      const res = await syncAdAccountsNowAction(storeId);
      if (res.error) {
        setSyncError(res.error);
      } else {
        await queryClient.invalidateQueries({ queryKey: ["ad-spend-view"] });
      }
      await queryClient.invalidateQueries({ queryKey: ["ad-campaigns", storeId] });
      const fresh = await fetchCampaigns(storeId, periodQs, true);
      queryClient.setQueryData(["ad-campaigns", storeId, period.key], fresh);
      // Não chamar `refetch()` aqui: faria um pedido sem `sync=1` e podia
      // sobrescrever imediatamente os dados frescos com a resposta "cache BD".
    });
  }

  if (!hasLinkedAccounts) {
    const empty = (
      <p className="text-sm text-muted-foreground">
        Liga uma conta em Contas API para ver campanhas activas.
      </p>
    );
    if (embedded) {
      return (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Campanhas</h2>
            <p className="text-sm text-muted-foreground">
              Performance por campanha (requer conta API ligada).
            </p>
          </div>
          {empty}
        </div>
      );
    }
    return (
      <CollapsibleSection
        title="Campanhas"
        description="Liga uma conta API para ver campanhas activas."
      >
        {empty}
      </CollapsibleSection>
    );
  }

  const syncedLabel = data?.syncedAt
    ? new Date(data.syncedAt).toLocaleString("pt-PT", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const body = (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          {embedded && (
            <>
              <h2 className="text-lg font-semibold">Campanhas</h2>
              <p className="text-sm text-muted-foreground">
                {data
                  ? `${data.campaigns.length} campanha${data.campaigns.length === 1 ? "" : "s"} · ${data.dateLabel}${
                      data.daysInPeriod > 1 && data.daysWithData > 0
                        ? ` · ${data.daysWithData} dia${data.daysWithData === 1 ? "" : "s"} com gasto`
                        : ""
                    }`
                  : "A carregar…"}
              </p>
              <p className="text-xs text-muted-foreground">
                Período definido no selector do topo da página. Dias passados vêm
                da BD (sem pedido à Google).
              </p>
            </>
          )}
          {!embedded && (
            <p className="text-xs text-muted-foreground">
              Performance por campanha no período seleccionado.
            </p>
          )}
          {syncedLabel && (
            <p className="text-xs text-muted-foreground">
              Último sync: {syncedLabel}
              {data?.source === "live" ? " · actualizado agora" : " · cache BD"}
              {data?.displayCurrency && data?.fxDateKey
                ? ` · valores em ${data.displayCurrency} (câmbio ${data.fxDateKey})`
                : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runSync}
            disabled={syncing || isFetching}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            title="Sincroniza hoje na API e actualiza a tabela"
          >
            <RefreshCw
              className={cn("h-4 w-4", (syncing || isFetching) && "animate-spin")}
            />
            {syncing ? "A sincronizar…" : "Actualizar"}
          </button>
        </div>
      </div>

      {syncError && (
        <p className="mb-4 rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {syncError}
        </p>
      )}

      {adApiQuotaPaused && (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-muted-foreground">
          Quota da API esgotada — sync automático pausado (só cron + botão
          «Actualizar»). Os dados na BD mantêm-se.
        </p>
      )}

      {isError && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          Não foi possível carregar as campanhas.
        </p>
      )}

      {isLoading && (
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      )}

      {data && data.errors.length > 0 && (
        <div className="mb-4 space-y-1">
          {data.errors.map((err) => (
            <p
              key={err}
              className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-muted-foreground"
            >
              {err}
            </p>
          ))}
        </div>
      )}

      {data && data.campaigns.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">
          Nenhuma campanha com dados neste período na BD.
          {includesToday
            ? " Clica em Actualizar para sincronizar hoje na API."
            : " Os dados são guardados quando o sync corre (automático em «Hoje»)."}
        </p>
      )}

      {data && !isLoading && (
        <CampaignTotalsKpis
          totals={data.totals}
          multiDay={data.daysInPeriod > 1}
        />
      )}

      {data && data.campaigns.length > 0 && (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Campanha</th>
                  <th className="px-3 py-2.5 font-medium">Plataforma</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-3 py-2.5 text-right font-medium">Gasto</th>
                  <th className="px-3 py-2.5 text-right font-medium">Conv.</th>
                  <th className="px-3 py-2.5 text-right font-medium">ROAS</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cliques</th>
                  <th className="px-3 py-2.5 text-right font-medium">CPC</th>
                  <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr
                    key={`${c.platform}-${c.campaignId}`}
                    className="border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    <td className="max-w-[220px] px-3 py-2.5 align-top">
                      <Sensitive className="block truncate font-medium leading-snug">
                        {c.campaignName}
                      </Sensitive>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <Sensitive>{c.adAccountName}</Sensitive>
                      </p>
                    </td>
                    <td className="px-3 py-2.5 align-top whitespace-nowrap text-muted-foreground">
                      {c.platformLabel}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <StatusBadge label={c.statusLabel} />
                    </td>
                    <td className="px-3 py-2.5 align-top text-right whitespace-nowrap tabular-nums">
                      <MoneyCell
                        amount={c.spend}
                        currency={c.currency}
                        inputAmount={c.spendInput}
                        inputCurrency={c.inputCurrency}
                        platformAmount={c.spendPlatformInput ?? c.spendPlatform}
                      />
                    </td>
                    <td className="px-3 py-2.5 align-top text-right whitespace-nowrap tabular-nums">
                      <Sensitive>{fmtConversions(c.conversions)}</Sensitive>
                    </td>
                    <td className="px-3 py-2.5 align-top text-right whitespace-nowrap tabular-nums">
                      <Sensitive>{fmtRoas(c.roas)}</Sensitive>
                    </td>
                    <td className="px-3 py-2.5 align-top text-right whitespace-nowrap tabular-nums">
                      <Sensitive>{c.clicks.toLocaleString("pt-PT")}</Sensitive>
                    </td>
                    <td className="px-3 py-2.5 align-top text-right whitespace-nowrap tabular-nums">
                      <Sensitive>{fmtMetric(c.cpc)}</Sensitive>
                    </td>
                    <td className="px-3 py-2.5 align-top text-right whitespace-nowrap tabular-nums">
                      <Sensitive>{fmtMetric(c.ctr, "%")}</Sensitive>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {data.campaigns.map((c) => (
              <div
                key={`${c.platform}-${c.campaignId}-m`}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Sensitive className="block font-medium leading-snug">
                      {c.campaignName}
                    </Sensitive>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.platformLabel}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      <Sensitive>{c.adAccountName}</Sensitive>
                    </p>
                  </div>
                  <StatusBadge label={c.statusLabel} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Gasto</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      <MoneyCell
                        amount={c.spend}
                        currency={c.currency}
                        inputAmount={c.spendInput}
                        inputCurrency={c.inputCurrency}
                        platformAmount={c.spendPlatformInput ?? c.spendPlatform}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">ROAS</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      <Sensitive>{fmtRoas(c.roas)}</Sensitive>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Conv.</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      <Sensitive>{fmtConversions(c.conversions)}</Sensitive>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cliques</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      <Sensitive>{c.clicks.toLocaleString("pt-PT")}</Sensitive>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">CPC</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      <Sensitive>{fmtMetric(c.cpc)}</Sensitive>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">CTR</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      <Sensitive>{fmtMetric(c.ctr, "%")}</Sensitive>
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );

  if (embedded) return <div className="space-y-4">{body}</div>;

  return (
    <CollapsibleSection
      title="Campanhas"
      description={
        data
          ? `${data.campaigns.length} campanha${data.campaigns.length === 1 ? "" : "s"} · ${data.dateLabel}`
          : "Campanhas activas"
      }
    >
      {body}
    </CollapsibleSection>
  );
}
