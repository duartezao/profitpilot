"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import { CollapsibleSection } from "@/components/collapsible-section";
import { syncAdAccountsNowAction } from "@/app/(app)/anuncios/ad-account-actions";
import type { StoreCampaignsView } from "@/lib/ad-campaign-types";
import { cn } from "@/lib/utils";

function fmtMoney(v: number, currency: string): string {
  return `${v.toFixed(2).replace(".", ",")} ${currency}`;
}

function fmtMetric(v: number | null, suffix = ""): string {
  if (v == null) return "—";
  return `${v.toFixed(2).replace(".", ",")}${suffix}`;
}

function StatusBadge({ label }: { label: string }) {
  const active = label === "Activa";
  const paused = label === "Pausada";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
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
  sync = false,
): Promise<StoreCampaignsView> {
  const q = sync ? "&sync=1" : "";
  const res = await fetch(
    `/api/anuncios/campaigns?store=${encodeURIComponent(storeId)}${q}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("Falha ao carregar campanhas.");
  return res.json();
}

export function CampaignsPanel({
  storeId,
  hasLinkedAccounts,
}: {
  storeId: string;
  hasLinkedAccounts: boolean;
}) {
  const queryClient = useQueryClient();
  const [syncing, startSync] = useTransition();

  const { data, isError, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["ad-campaigns", storeId],
    queryFn: () => fetchCampaigns(storeId),
    enabled: hasLinkedAccounts,
    staleTime: 30_000,
    refetchInterval: hasLinkedAccounts ? 120_000 : false,
  });

  function runSync() {
    startSync(async () => {
      const res = await syncAdAccountsNowAction(storeId);
      if (res.error) {
        await refetch();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["ad-campaigns", storeId] });
      await fetchCampaigns(storeId, true);
      await refetch();
    });
  }

  if (!hasLinkedAccounts) {
    return (
      <CollapsibleSection
        title="Campanhas"
        description="Liga uma conta API (Meta, Google ou TikTok) para ver campanhas activas."
      >
        <p className="text-sm text-muted-foreground">
          Sem contas API ligadas a esta loja.
        </p>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection
      title="Campanhas"
      description={
        data
          ? `${data.campaigns.length} campanha${data.campaigns.length === 1 ? "" : "s"} · ${data.dateLabel} (${data.dateKey})`
          : "Campanhas activas das contas API ligadas"
      }
      defaultOpen
      badge={
        data?.source === "live" ? (
          <span className="rounded-md border border-positive/30 bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive">
            Ao vivo
          </span>
        ) : data?.source === "mixed" ? (
          <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Misto
          </span>
        ) : data?.source === "cache" && data.campaigns.length > 0 ? (
          <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Cache
          </span>
        ) : undefined
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Estado e métricas de hoje por campanha (gasto, impressões, cliques, CPC,
          CTR, CPM).
        </p>
        <button
          type="button"
          onClick={runSync}
          disabled={syncing || isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", (syncing || isFetching) && "animate-spin")}
          />
          {syncing ? "A sincronizar…" : "Actualizar"}
        </button>
      </div>

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
          Nenhuma campanha activa encontrada hoje. Clica em Actualizar depois de
          ligar a conta API — ou regista o gasto manualmente na tabela abaixo.
        </p>
      )}

      {data && data.campaigns.length > 0 && (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">Campanha</th>
                  <th className="px-4 py-3">Plataforma</th>
                  <th className="px-4 py-3">Conta</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Gasto</th>
                  <th className="px-4 py-3 text-right">Impr.</th>
                  <th className="px-4 py-3 text-right">Cliques</th>
                  <th className="px-4 py-3 text-right">CPC</th>
                  <th className="px-4 py-3 text-right">CTR</th>
                  <th className="px-4 py-3 text-right">CPM</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr
                    key={`${c.platform}-${c.campaignId}`}
                    className="border-t border-border hover:bg-muted/50"
                  >
                    <td className="max-w-[200px] px-4 py-3 font-medium">
                      <Sensitive className="truncate">{c.campaignName}</Sensitive>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {c.campaignId}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.platformLabel}
                    </td>
                    <td className="max-w-[120px] px-4 py-3 text-xs text-muted-foreground">
                      <Sensitive className="truncate">{c.adAccountName}</Sensitive>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={c.statusLabel} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Sensitive>{fmtMoney(c.spend, c.currency)}</Sensitive>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Sensitive>{c.impressions.toLocaleString("pt-PT")}</Sensitive>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Sensitive>{c.clicks.toLocaleString("pt-PT")}</Sensitive>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Sensitive>{fmtMetric(c.cpc)}</Sensitive>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Sensitive>{fmtMetric(c.ctr, "%")}</Sensitive>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Sensitive>{fmtMetric(c.cpm)}</Sensitive>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {data.campaigns.map((c) => (
              <div
                key={`${c.platform}-${c.campaignId}-m`}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Sensitive className="font-medium leading-snug">
                      {c.campaignName}
                    </Sensitive>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.platformLabel} · <Sensitive>{c.adAccountName}</Sensitive>
                    </p>
                  </div>
                  <StatusBadge label={c.statusLabel} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Gasto</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      <Sensitive>{fmtMoney(c.spend, c.currency)}</Sensitive>
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
    </CollapsibleSection>
  );
}
