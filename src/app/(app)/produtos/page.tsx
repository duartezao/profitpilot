import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { buildStoreProductRanking } from "@/lib/metrics";
import { ProductsProfitTable } from "@/components/dashboard/products-profit-table";

export const metadata: Metadata = { title: "Produtos" };
export const dynamic = "force-dynamic";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{
    store?: string;
    period?: string;
    from?: string;
    to?: string;
    dates?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const { store: storeId, period, from, to, dates } = await searchParams;

  if (!storeId) {
    redirect("/dashboard");
  }

  const { products, storeName, periodLabel } = await buildStoreProductRanking(
    user?.workspaceId ?? "",
    storeId,
    { period, from, to, dates },
    20,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Produtos · <span data-sensitive>{storeName || "Loja"}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Top produtos por lucro · {periodLabel}
        </p>
      </div>

      <ProductsProfitTable products={products} />
    </div>
  );
}
