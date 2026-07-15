"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import { ExportFormatLinks } from "@/components/export-format-links";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Sensitive } from "@/components/privacy-mode";
import { useWorkspace } from "@/components/workspace-context";
import { periodQueryFromSearchParams } from "@/lib/period";
import type {
  CollectionSalesRow,
  ProductWithCollectionRow,
} from "@/lib/collection-sales";
import { cn } from "@/lib/utils";

type CollectionSalesResponse = {
  collections: CollectionSalesRow[];
  products: ProductWithCollectionRow[];
  storeName: string;
  periodLabel: string;
  catalogMappedCount: number;
  unmappedProductCount: number;
  lastCatalogSyncAt: string | null;
};

async function fetchCollectionSales(
  storeId: string,
  params: URLSearchParams,
): Promise<CollectionSalesResponse> {
  const q = new URLSearchParams(periodQueryFromSearchParams(params));
  q.set("store", storeId);
  const res = await fetch(`/api/collections/sales?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar vendas por coleção.");
  return res.json();
}

function exportUrl(storeId: string, params: URLSearchParams): string {
  const q = new URLSearchParams(periodQueryFromSearchParams(params));
  q.set("store", storeId);
  return `/api/collections/sales?${q}`;
}

function CollectionRow({ row }: { row: CollectionSalesRow }) {
  const [open, setOpen] = useState(false);
  const hasDaily = row.daily.length > 0;

  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => hasDaily && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5",
          hasDaily && "hover:bg-muted/40",
          !hasDaily && "cursor-default",
        )}
        aria-expanded={open}
        disabled={!hasDaily}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
          <Layers className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <Sensitive className="block truncate font-medium">{row.collectionTitle}</Sensitive>
          {row.handle && (
            <p className="truncate text-xs text-muted-foreground">
              <Sensitive>{row.handle}</Sensitive>
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular-nums font-medium">
            <Sensitive>{row.units}</Sensitive>
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            <Sensitive>{row.revenueFmt}</Sensitive>
          </p>
        </div>
        {hasDaily && (
          <span className="shrink-0 text-muted-foreground">
            {open ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        )}
      </button>

      {open && hasDaily && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 sm:px-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Vendas por dia
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Dia</th>
                  <th className="pb-2 pr-4 text-right font-medium">Unidades</th>
                  <th className="pb-2 text-right font-medium">Receita</th>
                </tr>
              </thead>
              <tbody>
                {row.daily.map((d) => (
                  <tr key={d.dateKey} className="border-t border-border/60">
                    <td className="py-2 pr-4 text-muted-foreground">{d.dateLabel}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      <Sensitive>{d.units}</Sensitive>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <Sensitive>{d.revenueFmt}</Sensitive>
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

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="h-14 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-96 animate-pulse rounded-lg border border-border bg-muted" />
    </div>
  );
}

export function ColecoesVendasClient({ storeId }: { storeId: string }) {
  const { workspaceId } = useWorkspace();
  const searchParams = useSearchParams();
  const periodKey = periodQueryFromSearchParams(searchParams);

  const { data, isError, isLoading } = useQuery({
    queryKey: ["collection-sales", workspaceId, storeId, periodKey],
    queryFn: () => fetchCollectionSales(storeId, searchParams),
    staleTime: 30_000,
  });

  if (isLoading && !data) return <PageSkeleton />;

  if (isError || !data) {
    return (
      <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
        Não foi possível carregar as vendas por coleção.
      </p>
    );
  }

  const lastSync = data.lastCatalogSyncAt
    ? new Date(data.lastCatalogSyncAt).toLocaleString("pt-PT", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Vendas por coleção ·{" "}
            <Sensitive as="span">{data.storeName || "Loja"}</Sensitive>
          </h1>
          <p className="text-sm text-muted-foreground">
            Top coleções Shopify · {data.periodLabel}
          </p>
        </div>
        <ExportFormatLinks href={exportUrl(storeId, searchParams)} />
      </div>

      <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted-foreground sm:px-5">
        <p>
          Cada venda conta na <span className="font-medium text-foreground">coleção principal</span>{" "}
          do produto (primeira coleção manual da Shopify, excluindo «All»). Cruza estes
          números com as campanhas Google Ads pelo nome da coleção.
        </p>
        {lastSync && (
          <p className="mt-2 text-xs">
            Coleções actualizadas no último sync de produtos: {lastSync}.
          </p>
        )}
        {data.unmappedProductCount > 0 && (
          <p className="mt-2 text-xs text-warning">
            {data.unmappedProductCount}{" "}
            {data.unmappedProductCount === 1
              ? "produto vendido ainda sem coleção mapeada"
              : "produtos vendidos ainda sem coleção mapeada"}
            — corre um sync da loja para actualizar o catálogo.
          </p>
        )}
      </div>

      <CollapsibleSection
        title="Top coleções"
        description="Unidades e receita no período. Expande para ver vendas por dia."
        badge={
          data.collections.length > 0 ? (
            <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {data.collections.length}
            </span>
          ) : undefined
        }
        defaultOpen
        flush
      >
        {data.collections.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Sem vendas no período ou catálogo ainda por sincronizar.
          </p>
        ) : (
          <div>
            <div className="hidden border-b border-border px-5 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_auto_auto] sm:gap-4">
              <span>Coleção</span>
              <span className="text-right">Unidades</span>
              <span className="w-5" />
            </div>
            {data.collections.map((row) => (
              <CollectionRow key={row.collectionId} row={row} />
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Produtos vendidos"
        description="Cada produto com a coleção principal associada."
        badge={
          data.products.length > 0 ? (
            <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {data.products.length}
            </span>
          ) : undefined
        }
        flush
      >
        {data.products.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Sem produtos vendidos no período.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted-foreground">
                    <th className="px-5 py-3">Produto</th>
                    <th className="px-5 py-3">Coleção</th>
                    <th className="px-5 py-3 text-right">Unidades</th>
                    <th className="px-5 py-3 text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr
                      key={`${p.title}-${p.collectionTitle}`}
                      className="border-t border-border hover:bg-muted"
                    >
                      <td className="px-5 py-3">
                        <Sensitive className="font-medium">{p.title}</Sensitive>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        <Sensitive>{p.collectionTitle}</Sensitive>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <Sensitive>{p.units}</Sensitive>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                        <Sensitive>{p.revenue}</Sensitive>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 lg:hidden">
              {data.products.map((p) => (
                <div
                  key={`${p.title}-${p.collectionTitle}`}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <Sensitive className="font-medium leading-snug">{p.title}</Sensitive>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Sensitive>{p.collectionTitle}</Sensitive>
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <Sensitive>{p.units}</Sensitive> unidades ·{" "}
                    <Sensitive>{p.revenue}</Sensitive>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </CollapsibleSection>
    </div>
  );
}
