"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useWorkspace } from "@/components/workspace-context";
import { scopeQueryFromInput } from "@/lib/scope-query";
import type { AdSpendView } from "@/lib/ad-spend-view";
import { AnunciosStoreView } from "@/components/anuncios/anuncios-store-view";
import {
  AD_API_SYNC_INTERVAL_MS,
  LIVE_DATA_POLL_MS,
} from "@/lib/ad-sync-constants";
import { LastSyncBadge } from "@/components/last-sync-badge";

async function fetchAdSpendView(storeId: string | null): Promise<AdSpendView> {
  const url = storeId
    ? `/api/anuncios/view?store=${encodeURIComponent(storeId)}`
    : "/api/anuncios/view";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar ad spend.");
  return res.json();
}

export function AnunciosClient() {
  const { workspaceId } = useWorkspace();
  const storeId = useSearchParams().get("store");
  const queryClient = useQueryClient();

  const { data, isError, isFetching } = useQuery({
    queryKey: ["ad-spend-view", workspaceId, storeId],
    queryFn: () => fetchAdSpendView(storeId),
    staleTime: LIVE_DATA_POLL_MS - 10_000,
    refetchInterval: LIVE_DATA_POLL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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
      const body = (await res.json()) as {
        synced?: boolean;
        backfill?: { synced?: number; spendDays?: number };
      };
      if (body.synced || (body.backfill?.synced ?? 0) > 0 || (body.backfill?.spendDays ?? 0) > 0) {
        void queryClient.invalidateQueries({
          queryKey: ["ad-spend-view", workspaceId, storeId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["ad-campaigns", storeId],
        });
        void queryClient.invalidateQueries({ queryKey: ["metrics-summary"] });
      }
      return body;
    },
    enabled: Boolean(storeId),
    refetchInterval: AD_API_SYNC_INTERVAL_MS,
    staleTime: AD_API_SYNC_INTERVAL_MS - 60_000,
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
          <LastSyncBadge
            lastSyncedAt={data.lastSyncedAt}
            fetching={isFetching}
          />
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
    <AnunciosStoreView
      store={s}
      lastSyncedAt={data.lastSyncedAt}
      isFetching={isFetching}
      onDataChanged={onDataChanged}
    />
  );
}
