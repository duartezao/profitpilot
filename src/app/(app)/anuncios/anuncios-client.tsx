"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { ExportFormatLinks } from "@/components/export-format-links";
import { useWorkspace } from "@/components/workspace-context";
import { scopeQueryFromInput } from "@/lib/scope-query";
import type { AdSpendView } from "@/lib/ad-spend-view";
import { AdSpendForm } from "./ad-spend-form";
import { AdSpendRow } from "./ad-spend-row";
import { AdAccountsPanel } from "@/components/anuncios/ad-accounts-panel";
import { GoogleAdsStoreLink } from "@/components/anuncios/google-ads-store-link";
import { CampaignsPanel } from "@/components/anuncios/campaigns-panel";
import { CollapsibleSection } from "@/components/collapsible-section";

async function fetchAdSpendView(storeId: string | null): Promise<AdSpendView> {
  const url = storeId
    ? `/api/anuncios/view?store=${encodeURIComponent(storeId)}`
    : "/api/anuncios/view";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar ad spend.");
  return res.json();
}

function LiveBadge({ updatedAt, fetching }: { updatedAt?: number; fetching: boolean }) {
  const label = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("pt-PT")
    : null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span
          className={
            fetching
              ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75"
              : "hidden"
          }
        />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
      </span>
      <span className="tabular-nums">
        {label ? `Ao vivo · ${label}` : "A ligar…"}
      </span>
    </div>
  );
}

export function AnunciosClient() {
  const { workspaceId } = useWorkspace();
  const storeId = useSearchParams().get("store");
  const queryClient = useQueryClient();

  const { data, isError, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["ad-spend-view", workspaceId, storeId],
    queryFn: () => fetchAdSpendView(storeId),
    staleTime: 5_000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  function onDataChanged() {
    void queryClient.invalidateQueries({
      queryKey: ["ad-spend-view", workspaceId, storeId],
    });
    void queryClient.invalidateQueries({ queryKey: ["metrics-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["treasury"] });
    void queryClient.invalidateQueries({ queryKey: ["ad-campaigns"] });
    void queryClient.invalidateQueries({ queryKey: ["decision-summary"] });
  }

  if (isError) {
    return (
      <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
        Não foi possível carregar os dados. A tentar novamente…
      </p>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-lg border border-border bg-muted" />
      </div>
    );
  }

  if (data.mode === "overview") {
    const { summaries } = data.overview;
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Anúncios</h1>
            <p className="text-sm text-muted-foreground">
            Ad spend manual por loja e plataforma — selecciona uma loja no topo
            para preencher.
          </p>
          </div>
          <LiveBadge updatedAt={dataUpdatedAt} fetching={isFetching} />
        </div>

        {summaries.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-12 text-center text-sm text-muted-foreground">
            Liga uma loja para registar ad spend.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border p-5">
              <h2 className="text-lg font-semibold">Dias em falta por loja</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Loja</th>
                    <th className="px-4 py-3 text-right">Dias em falta</th>
                    <th className="px-4 py-3">Ontem</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s) => {
                    const qs = scopeQueryFromInput({ store: s.storeId });
                    return (
                      <tr key={s.storeId} className="border-t border-border">
                        <td className="px-4 py-3 font-medium" data-sensitive>
                          {s.storeName}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {s.missingCount}
                        </td>
                        <td className="px-4 py-3">
                          {s.yesterdayMissing ? (
                            <span className="text-xs font-medium text-warning">
                              Em falta
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              OK
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={qs ? `/anuncios?${qs}` : "/anuncios"}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Preencher
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  const s = data.store;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Anúncios · <span data-sensitive>{s.storeName}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Por plataforma (Meta, Google, TikTok) com fees de agência — actualiza
            a cada 10 s.
          </p>
        </div>
        <LiveBadge updatedAt={dataUpdatedAt} fetching={isFetching} />
        <ExportFormatLinks
          href={`/api/export/ad-spend?store=${encodeURIComponent(s.storeId)}`}
        />
      </div>

      {s.missingCount > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">
                {s.missingCount}{" "}
                {s.missingCount === 1 ? "dia em falta" : "dias em falta"}
                {s.yesterdayMissing ? " — incluindo ontem" : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      <GoogleAdsStoreLink
        storeId={s.storeId}
        canEdit={s.canEdit}
        workspaceGoogleLogins={s.workspaceGoogleLogins}
        googleAdsApiReady={s.googleAdsApiReady}
        googleAccount={s.adAccounts.find((a) => a.platform === "google")}
        onChanged={onDataChanged}
      />

      <CollapsibleSection
        title="Registar gasto manual"
        description={`Ontem (${s.yesterday}) ou outro dia — Meta/Google/TikTok. Isto é o que importa para o lucro.`}
        defaultOpen
      >
        <AdSpendForm
          storeId={s.storeId}
          storeName={s.storeName}
          baseCurrency={s.baseCurrency}
          defaultDate={s.yesterday}
          minDate={s.minDate}
          canEdit={s.canEdit}
          onSaved={onDataChanged}
          embedded
        />
      </CollapsibleSection>

      <AdAccountsPanel
        storeId={s.storeId}
        accounts={s.adAccounts}
        canEdit={s.canEdit}
        onChanged={onDataChanged}
      />

      <CampaignsPanel
        storeId={s.storeId}
        hasLinkedAccounts={s.adAccounts.length > 0}
      />

      <CollapsibleSection
        title="Dias a preencher"
        description={`${s.calendar.length} dias desde importação · actualiza a cada 10 s.`}
        badge={
          s.missingCount > 0 ? (
            <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
              {s.missingCount} em falta
            </span>
          ) : (
            <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Completo
            </span>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Dia</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Total ({s.baseCurrency})</th>
                <th className="px-4 py-3 w-28">Ação</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {s.calendar.map((row) => (
                <AdSpendRow
                  key={`${row.dateKey}-${row.revisionAt ?? "new"}`}
                  row={row}
                  storeId={s.storeId}
                  canEdit={s.canEdit}
                  onChanged={onDataChanged}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </div>
  );
}
