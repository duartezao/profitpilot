import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { storeQueryForUser } from "@/lib/store-scope";
import { canAccessStore } from "@/lib/store-access";
import { ProductCost } from "@/models/ProductCost";
import { listSoldVariantsMissingCost } from "@/lib/cogs";
import { CostRow, type CostRowData } from "./cost-row";

export const metadata: Metadata = { title: "Custos (COGS)" };

export default async function CogsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { store: storeId } = await searchParams;

  const user = await getCurrentUser();
  await connectToDatabase();

  if (!user) return null;

  const stores = await Store.find(storeQueryForUser(user))
    .select("name currency")
    .lean();
  const scoped =
    storeId && canAccessStore(user.storeAccess, storeId)
      ? stores.find((s) => String(s._id) === storeId)
      : null;
  const storeMap = new Map(
    stores.map((s) => [String(s._id), { name: s.name, currency: s.currency ?? "EUR" }]),
  );
  const storeIds = scoped ? [scoped._id] : stores.map((s) => s._id);

  const soldMissing = await listSoldVariantsMissingCost(storeIds);

  const costDocs =
    soldMissing.length > 0
      ? await ProductCost.find({
          storeId: { $in: storeIds },
          variantId: { $in: soldMissing.map((s) => s.variantId) },
        }).lean()
      : [];
  const costByKey = new Map(
    costDocs.map((c) => [`${c.storeId}:${c.variantId}`, c]),
  );

  const rows: CostRowData[] = soldMissing.map((s) => {
    const store = storeMap.get(s.storeId);
    const cost = costByKey.get(`${s.storeId}:${s.variantId}`);
    return {
      storeId: s.storeId,
      storeName: store?.name ?? "—",
      variantId: s.variantId,
      title: cost?.title ?? s.title,
      shopifyCost: cost?.unitCost ?? 0,
      manualCost: cost?.manualCost ?? null,
      manualFrom: cost?.manualCostFrom
        ? new Date(cost.manualCostFrom).toISOString()
        : null,
      currency: store?.currency ?? "EUR",
      unitsSold: s.unitsSold,
      orderCount: s.orderCount,
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {scoped ? (
            <>
              COGS · <span data-sensitive>{scoped.name}</span>
            </>
          ) : (
            "Custos (COGS)"
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {scoped
            ? "Produtos vendidos nesta loja sem custo definido."
            : "Produtos vendidos sem custo definido. Só aparecem variantes com encomendas em falta de COGS."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Cada venda guarda o custo da altura. Se o fornecedor mudar o preço,
          actualiza aqui ou na Shopify — o histórico usa o valor válido por dia
          e vendas antigas não mudam. Enquanto o fornecedor não tiver dado
          update, o custo antigo continua nas encomendas já registadas.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            {storeIds.length === 0
              ? "Liga uma loja e sincroniza para ver produtos vendidos."
              : "Não há vendas sem custo. O lucro usa o COGS registado — confirma que os preços do fornecedor estão actualizados."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3 text-right">Vendidos</th>
                  <th className="px-4 py-3 text-right">Custo</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Definir custo manual</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <CostRow key={`${r.storeId}:${r.variantId}`} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
