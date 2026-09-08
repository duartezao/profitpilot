"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Copy, Link2, Target } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import type { CollectionRoasReport, CollectionRoasRow, ProductRoasRow } from "@/lib/collection-roas";
import { periodQueryFromSearchParams } from "@/lib/period";
import { cn } from "@/lib/utils";
import { syncAdAccountsNowAction } from "@/app/(app)/anuncios/ad-account-actions";

type RevenueFilter = "all" | "with_rev" | "no_sales";

const REVENUE_FILTERS: {
  id: RevenueFilter;
  label: string;
}[] = [
  { id: "all", label: "Todas" },
  { id: "with_rev", label: "Com REV" },
  { id: "no_sales", label: "Sem vendas" },
];

function filterCollections(
  rows: CollectionRoasRow[],
  filter: RevenueFilter,
): CollectionRoasRow[] {
  if (filter === "with_rev") return rows.filter((r) => r.revenue > 0);
  if (filter === "no_sales") return rows.filter((r) => r.revenue <= 0);
  return rows;
}

async function fetchCollectionRoas(
  storeId: string,
  params: URLSearchParams,
  refresh = false,
): Promise<CollectionRoasReport> {
  const q = new URLSearchParams(periodQueryFromSearchParams(params));
  q.set("store", storeId);
  if (refresh) q.set("refresh", "1");
  const res = await fetch(`/api/collections/roas?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar ROAS por coleção.");
  return res.json();
}

function CopyBriefingButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copiado
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copiar
        </>
      )}
    </button>
  );
}

function CollectionRoasCard({ row }: { row: CollectionRoasRow }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-3 sm:px-5"
        aria-expanded={open}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
            <Target className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <Sensitive className="block truncate font-medium">
              {row.collectionTitle}
            </Sensitive>
            <p className="truncate text-xs text-muted-foreground">
              <Sensitive>/collections/{row.handle}</Sensitive>
              {" · "}
              <span className="tabular-nums">{row.activeDaysLabel}</span>
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[300px]">
          <div className="grid grid-cols-3 gap-2">
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">REV</p>
              <p className="tabular-nums text-sm font-medium">
                <Sensitive>{row.revenueFmt}</Sensitive>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Spend</p>
              <p className="tabular-nums text-sm font-medium">
                <Sensitive>{row.adSpendFmt}</Sensitive>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">ROAS real</p>
              <p
                className={cn(
                  "tabular-nums text-sm font-semibold",
                  row.realRoas != null && row.realRoas >= 1
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Sensitive>{row.realRoasFmt}</Sensitive>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">CPC</p>
              <p className="tabular-nums text-sm font-medium">
                <Sensitive>{row.cpcFmt}</Sensitive>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">CPM</p>
              <p className="tabular-nums text-sm font-medium">
                <Sensitive>{row.cpmFmt}</Sensitive>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">CTR</p>
              <p className="tabular-nums text-sm font-medium">
                <Sensitive>{row.ctrFmt}</Sensitive>
              </p>
            </div>
          </div>
        </div>

        <span className="hidden shrink-0 text-muted-foreground sm:inline">
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 sm:px-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Campanhas com este destino ({row.campaigns.length})
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Campanha</th>
                  <th className="pb-2 pr-3 font-medium">Plataforma</th>
                  <th className="pb-2 pr-3 text-right font-medium">Activo</th>
                  <th className="pb-2 pr-3 text-right font-medium">Spend</th>
                  <th className="pb-2 pr-3 text-right font-medium">CPC</th>
                  <th className="pb-2 pr-3 text-right font-medium">CPM</th>
                  <th className="pb-2 pr-3 text-right font-medium">CTR</th>
                  <th className="pb-2 text-right font-medium">ROAS plat.</th>
                </tr>
              </thead>
              <tbody>
                {row.campaigns.map((c) => (
                  <tr
                    key={`${c.platform}-${c.campaignId}`}
                    className="border-t border-border/60"
                  >
                    <td className="py-2 pr-3">
                      <Sensitive className="block max-w-[220px] truncate">
                        {c.campaignName}
                      </Sensitive>
                      {c.landingUrls[0] && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          <Sensitive>{c.landingUrls[0]}</Sensitive>
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {c.platformLabel}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {c.activeDays}
                      <span className="text-[11px]">d</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      <Sensitive>{c.spendFmt}</Sensitive>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      <Sensitive>{c.cpcFmt}</Sensitive>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      <Sensitive>{c.cpmFmt}</Sensitive>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      <Sensitive>{c.ctrFmt}</Sensitive>
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      <Sensitive>{c.platformRoasFmt}</Sensitive>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductRoasCard({ row }: { row: ProductRoasRow }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-3 sm:px-5"
        aria-expanded={open}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
            <Target className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <Sensitive className="block truncate font-medium">
              {row.productTitle}
            </Sensitive>
            <p className="truncate text-xs text-muted-foreground">
              <Sensitive>/products/{row.productHandle}</Sensitive>
              {" · "}
              <span className="tabular-nums">{row.activeDaysLabel}</span>
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[300px]">
          <div className="grid grid-cols-3 gap-2">
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">REV</p>
              <p className="tabular-nums text-sm font-medium">
                <Sensitive>{row.revenueFmt}</Sensitive>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Spend</p>
              <p className="tabular-nums text-sm font-medium">
                <Sensitive>{row.adSpendFmt}</Sensitive>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">ROAS real</p>
              <p
                className={cn(
                  "tabular-nums text-sm font-semibold",
                  row.realRoas != null && row.realRoas >= 1
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Sensitive>{row.realRoasFmt}</Sensitive>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">CPC</p>
              <p className="tabular-nums text-sm font-medium">
                <Sensitive>{row.cpcFmt}</Sensitive>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">CPM</p>
              <p className="tabular-nums text-sm font-medium">
                <Sensitive>{row.cpmFmt}</Sensitive>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">CTR</p>
              <p className="tabular-nums text-sm font-medium">
                <Sensitive>{row.ctrFmt}</Sensitive>
              </p>
            </div>
          </div>
        </div>

        <span className="hidden shrink-0 text-muted-foreground sm:inline">
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 sm:px-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Campanhas com este destino ({row.campaigns.length})
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Campanha</th>
                  <th className="pb-2 pr-3 font-medium">Plataforma</th>
                  <th className="pb-2 pr-3 text-right font-medium">Activo</th>
                  <th className="pb-2 pr-3 text-right font-medium">Spend</th>
                  <th className="pb-2 pr-3 text-right font-medium">CPC</th>
                  <th className="pb-2 pr-3 text-right font-medium">CPM</th>
                  <th className="pb-2 pr-3 text-right font-medium">CTR</th>
                  <th className="pb-2 text-right font-medium">ROAS plat.</th>
                </tr>
              </thead>
              <tbody>
                {row.campaigns.map((c) => (
                  <tr
                    key={`${c.platform}-${c.campaignId}`}
                    className="border-t border-border/60"
                  >
                    <td className="py-2 pr-3">
                      <Sensitive className="block max-w-[220px] truncate">
                        {c.campaignName}
                      </Sensitive>
                      {c.landingUrls[0] && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          <Sensitive>{c.landingUrls[0]}</Sensitive>
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {c.platformLabel}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {c.activeDays}
                      <span className="text-[11px]">d</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      <Sensitive>{c.spendFmt}</Sensitive>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      <Sensitive>{c.cpcFmt}</Sensitive>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      <Sensitive>{c.cpmFmt}</Sensitive>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      <Sensitive>{c.ctrFmt}</Sensitive>
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      <Sensitive>{c.platformRoasFmt}</Sensitive>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function ColecoesRoasClient({ storeId }: { storeId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const periodQs = periodQueryFromSearchParams(searchParams);
  const activePreset = searchParams.get("period");
  const hasCustomRange =
    Boolean(searchParams.get("from") && searchParams.get("to")) ||
    Boolean(searchParams.get("dates"));
  const [revenueFilter, setRevenueFilter] = useState<RevenueFilter>("all");
  const [autoSyncing, setAutoSyncing] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["collection-roas", storeId, periodQs],
    queryFn: () => fetchCollectionRoas(storeId, searchParams, false),
  });

  // Sync automático: 1) sync ads da API, 2) refresh landing URLs
  const didAutoSync = useRef(false);
  useEffect(() => {
    if (didAutoSync.current || autoSyncing) return;
    didAutoSync.current = true;
    setAutoSyncing(true);

    (async () => {
      try {
        // 1) Sync campanhas da API (inclui spend de hoje)
        const syncRes = await syncAdAccountsNowAction(storeId);
        if (!syncRes.error) {
          await queryClient.invalidateQueries({ queryKey: ["ad-spend-view"] });
          await queryClient.invalidateQueries({ queryKey: ["ad-campaigns"] });
        }
        // 2) Refresh landing URLs das campanhas
        await fetchCollectionRoas(storeId, searchParams, true);
        await refetch();
      } catch {
        // Ignorar erros silenciosamente no auto-sync
      } finally {
        setAutoSyncing(false);
      }
    })();
  }, [storeId, searchParams, refetch, queryClient, autoSyncing]);

  const filterCounts = useMemo(() => {
    const rows = data?.collections ?? [];
    return {
      all: rows.length,
      with_rev: rows.filter((r) => r.revenue > 0).length,
      no_sales: rows.filter((r) => r.revenue <= 0).length,
    };
  }, [data?.collections]);

  const filteredCollections = useMemo(
    () => filterCollections(data?.collections ?? [], revenueFilter),
    [data?.collections, revenueFilter],
  );

  async function refreshUrls() {
    await fetchCollectionRoas(storeId, searchParams, true);
    await refetch();
  }

  function setQuickPeriod(days: 5 | 7) {
    const q = new URLSearchParams(searchParams.toString());
    q.set("store", storeId);
    q.delete("from");
    q.delete("to");
    q.delete("dates");
    q.delete("window");
    q.set("period", `${days}d`);
    router.replace(`${pathname}?${q}`);
  }

  const storeName = data?.storeName || "Loja";
  const quick5 = !hasCustomRange && activePreset === "5d";
  const quick7 = !hasCustomRange && activePreset === "7d";

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            ROAS por coleção
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Sensitive>{storeName}</Sensitive>
            {" — "}
            URL de destino das ads → coleção Shopify. ROAS real = REV ÷ spend.
            Seletor de datas no topo ou atalhos 5/7. Briefing EN da loja no
            fundo (todas as coleções juntas).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setQuickPeriod(5)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium tabular-nums",
                quick5
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              5 dias
            </button>
            <button
              type="button"
              onClick={() => setQuickPeriod(7)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium tabular-nums",
                quick7
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              7 dias
            </button>
          </div>
          <button
            type="button"
            onClick={() => void refreshUrls()}
            disabled={isFetching || autoSyncing}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
          >
            {autoSyncing ? "A sincronizar…" : isFetching ? "A actualizar…" : "Actualizar URLs"}
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      )}
      {isError && (
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Erro ao carregar."}
        </p>
      )}

      {data && (
        <>
          <p className="text-xs text-muted-foreground">
            {data.periodLabel}
            {data.storeDomain ? ` · ${data.storeDomain}` : null}
            {data.adAccountLabel ? ` · ${data.adAccountLabel}` : null}
            {data.lastLandingSyncAt
              ? ` · URLs sync ${new Date(data.lastLandingSyncAt).toLocaleString("pt-PT")}`
              : null}
          </p>
          {data.landingSyncErrors.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Aviso sync URLs: {data.landingSyncErrors[0]}
              {data.landingSyncErrors.length > 1
                ? ` (+${data.landingSyncErrors.length - 1})`
                : ""}
            </p>
          )}

          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-lg font-semibold">Coleções com ads</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredCollections.length === data.collections.length
                    ? `${data.collections.length} coleções`
                    : `${filteredCollections.length} de ${data.collections.length}`}
                  {" · "}acordeão fechado por defeito
                </p>
              </div>
              <div
                className="inline-flex w-full rounded-lg border border-border p-0.5 sm:w-auto"
                role="group"
                aria-label="Filtrar por receita"
              >
                {REVENUE_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRevenueFilter(f.id)}
                    className={cn(
                      "flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium sm:flex-none sm:px-3 sm:text-sm",
                      revenueFilter === f.id
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label}
                    <span className="ml-1 tabular-nums text-muted-foreground">
                      {filterCounts[f.id]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {data.collections.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
                Nenhuma coleção com campanha URL associada neste período.
              </p>
            ) : filteredCollections.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
                {revenueFilter === "with_rev"
                  ? "Nenhuma coleção com receita neste período."
                  : "Nenhuma coleção sem vendas neste período."}
              </p>
            ) : (
              filteredCollections.map((row) => (
                <CollectionRoasCard key={row.collectionId} row={row} />
              ))
            )}
          </section>

          {data.products.length > 0 && (
            <section className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <h2 className="text-lg font-semibold">Produtos com ads</h2>
                  <p className="text-sm text-muted-foreground">
                    {data.products.length} produtos com campanhas{" "}
                    <span className="font-medium text-foreground">
                      /products/…
                    </span>
                  </p>
                </div>
              </div>
              {data.products.map((row) => (
                <ProductRoasCard key={row.productHandle} row={row} />
              ))}
            </section>
          )}

          {data.storeBriefingText ? (
            <section className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
                <div>
                  <h2 className="text-lg font-semibold">Briefing (EN)</h2>
                  <p className="text-sm text-muted-foreground">
                    Todas as coleções desta loja ·{" "}
                    <Sensitive>{data.storeDomain || data.storeName}</Sensitive>
                  </p>
                </div>
                <CopyBriefingButton text={data.storeBriefingText} />
              </div>
              <pre className="whitespace-pre-wrap break-words px-4 py-4 font-sans text-xs leading-relaxed text-foreground sm:px-5 sm:text-sm">
                <Sensitive>{data.storeBriefingText}</Sensitive>
              </pre>
            </section>
          ) : null}

          {data.unmatchedCampaigns.length > 0 && (
            <section className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-3 sm:px-5">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  Campanhas sem coleção
                </h2>
                <p className="text-sm text-muted-foreground">
                  Têm spend no período mas o URL de destino não aponta para{" "}
                  <span className="font-medium text-foreground">
                    /collections/…
                  </span>
                  .
                </p>
              </div>
              <ul className="divide-y divide-border">
                {data.unmatchedCampaigns.map((c) => (
                  <li
                    key={`${c.platform}-${c.campaignId}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5"
                  >
                    <div className="min-w-0">
                      <Sensitive className="block truncate font-medium">
                        {c.campaignName}
                      </Sensitive>
                      <p className="text-xs text-muted-foreground">
                        {c.platformLabel}
                        {c.landingUrls[0]
                          ? ` · ${c.landingUrls[0]}`
                          : " · sem URL de coleção"}
                        {" · "}
                        <span className="tabular-nums">{c.activeDaysLabel}</span>
                      </p>
                    </div>
                    <p className="tabular-nums font-medium">
                      <Sensitive>{c.spendFmt}</Sensitive>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
