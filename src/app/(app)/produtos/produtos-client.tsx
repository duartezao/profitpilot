"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ProductsProfitTable } from "@/components/dashboard/products-profit-table";
import { Sensitive } from "@/components/privacy-mode";
import { useWorkspace } from "@/components/workspace-context";
import { periodQueryFromSearchParams } from "@/lib/period";
import type { DashboardSummary } from "@/lib/metrics";

type ProductsResponse = {
  products: DashboardSummary["topProducts"];
  storeName: string;
  periodLabel: string;
  mode: "profit" | "units";
};

async function fetchProducts(
  storeId: string,
  params: URLSearchParams,
): Promise<ProductsResponse> {
  const q = new URLSearchParams(periodQueryFromSearchParams(params));
  q.set("store", storeId);
  const res = await fetch(`/api/products/ranking?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar produtos.");
  return res.json();
}

function ProdutosSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="h-14 w-56 animate-pulse rounded-lg bg-muted" />
      <div className="h-72 animate-pulse rounded-lg border border-border bg-muted" />
    </div>
  );
}

export function ProdutosClient({ storeId }: { storeId: string }) {
  const { workspaceId } = useWorkspace();
  const searchParams = useSearchParams();
  const periodKey = periodQueryFromSearchParams(searchParams);

  const { data, isError, isLoading } = useQuery({
    queryKey: ["products-ranking", workspaceId, storeId, periodKey],
    queryFn: () => fetchProducts(storeId, searchParams),
    staleTime: 30_000,
  });

  if (isLoading && !data) return <ProdutosSkeleton />;

  if (isError || !data) {
    return (
      <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
        Não foi possível carregar os produtos.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Produtos ·{" "}
          <Sensitive as="span">{data.storeName || "Loja"}</Sensitive>
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.mode === "units"
            ? `Top produtos por unidades · ${data.periodLabel}`
            : `Top produtos por lucro · ${data.periodLabel}`}
        </p>
      </div>

      <ProductsProfitTable products={data.products} mode={data.mode} />
    </div>
  );
}
