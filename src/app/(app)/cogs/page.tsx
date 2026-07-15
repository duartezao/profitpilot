import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import { canAccessStore } from "@/lib/store-access";
import { ProductCost } from "@/models/ProductCost";
import { listSoldVariantsMissingCost } from "@/lib/cogs";
import {
  buildCogsDayRows,
  getBaseCurrency,
  listOrdersForCogsPanel,
} from "@/lib/manual-cogs";
import { appliesAutoEuCustomsFees } from "@/lib/eu-category-fees";
import {
  COGS_MODE_LABELS,
  tracksVariantCogs,
  type CogsMode,
} from "@/lib/cogs-modes";
import { CostRow, type CostRowData } from "./cost-row";
import { CogsCsvImport } from "./cogs-csv-import";
import { OrderCogsPanel } from "./order-cogs-panel";
import { DayCogsPanel } from "./day-cogs-panel";
import { CogsView } from "@/components/cogs/cogs-view";
import { PageTabCard } from "@/components/page-tabs";

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

  const stores = await Store.find(activeStoreQueryForUser(user))
    .select("name currency cogsMode cogsInputCurrency workspaceId importStartDate createdAt ianaTimezone")
    .lean();
  const scoped =
    storeId && canAccessStore(user.storeAccess, storeId)
      ? stores.find((s) => String(s._id) === storeId)
      : null;
  const storeMap = new Map(
    stores.map((s) => [
      String(s._id),
      {
        name: s.name,
        currency: s.currency ?? "EUR",
        cogsMode: (s.cogsMode ?? "shopify") as CogsMode,
        cogsInputCurrency: s.cogsInputCurrency ?? "EUR",
      },
    ]),
  );
  const activeMode = scoped
    ? ((scoped.cogsMode ?? "shopify") as CogsMode)
    : null;
  const variantStoreIds = scoped
    ? tracksVariantCogs(activeMode)
      ? [scoped._id]
      : []
    : stores
        .filter((s) => tracksVariantCogs(s.cogsMode))
        .map((s) => s._id);

  const baseCurrency = scoped
    ? await getBaseCurrency(scoped.workspaceId)
    : (
        await Workspace.findById(user.workspaceId).select("baseCurrency").lean()
      )?.baseCurrency ?? "EUR";

  let orderRows: Awaited<ReturnType<typeof listOrdersForCogsPanel>> = [];
  let dayRows: Awaited<ReturnType<typeof buildCogsDayRows>> = [];

  if (scoped && activeMode === "order") {
    orderRows = await listOrdersForCogsPanel(scoped._id);
  }
  if (scoped && activeMode === "day") {
    dayRows = await buildCogsDayRows(scoped, baseCurrency);
  }

  const showEuCustomsFeeInfo =
    scoped && activeMode && appliesAutoEuCustomsFees(activeMode);

  const showVariantTable = variantStoreIds.length > 0;

  const soldMissing = showVariantTable
    ? await listSoldVariantsMissingCost(variantStoreIds)
    : [];

  const costDocs =
    soldMissing.length > 0
      ? await ProductCost.find({
          storeId: { $in: variantStoreIds },
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
      inputCurrency: store?.cogsInputCurrency ?? "EUR",
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
        {scoped && activeMode && (
          <p className="mt-1 text-sm text-muted-foreground">
            Modo: {COGS_MODE_LABELS[activeMode]}
            {scoped.cogsInputCurrency && activeMode !== "shopify"
              ? ` · entrada em ${scoped.cogsInputCurrency}`
              : ""}
            {baseCurrency !== (scoped.currency ?? "EUR")
              ? ` · dashboard em ${baseCurrency}`
              : ""}
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {activeMode === "order"
            ? "Preenche o custo total de cada encomenda. O lucro usa estes valores."
            : activeMode === "day"
              ? "Preenche o COGS total por dia civil (fuso da loja)."
              : scoped
                ? "Produtos vendidos nesta loja sem custo definido."
                : showVariantTable
                  ? "Produtos vendidos sem custo (lojas Shopify ou por variante)."
                  : "Selecciona uma loja para gerir COGS por dia ou por encomenda."}
        </p>
        {showEuCustomsFeeInfo && scoped && (
          <p className="mt-2 text-sm text-muted-foreground">
            A taxa alfandegária UE (3 € por encomenda paga para
            destinos UE) conta no dia e é corrigida no sync se for
            cancelada sem envio — vê o detalhe no{" "}
            <a
              href={`/metricas?store=${String(scoped._id)}`}
              className="text-accent hover:underline"
            >
              overview de Métricas
            </a>{" "}
            ou na dashboard da loja.
          </p>
        )}
      </div>

      <CogsView
        mode={
          activeMode === "order"
            ? "order"
            : activeMode === "day"
              ? "day"
              : showVariantTable
                ? "variant"
                : null
        }
        missingCount={rows.length}
        main={
          <>
            {scoped && activeMode === "order" && (
              <PageTabCard>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">COGS por encomenda</h2>
                  <p className="text-sm text-muted-foreground">
                    {orderRows.length} encomendas no painel.
                  </p>
                </div>
                <OrderCogsPanel
                  storeId={String(scoped._id)}
                  storeName={scoped.name}
                  baseCurrency={baseCurrency}
                  inputCurrency={scoped.cogsInputCurrency ?? "EUR"}
                  rows={orderRows}
                />
              </PageTabCard>
            )}
            {scoped && activeMode === "day" && (
              <PageTabCard>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">COGS por dia</h2>
                  <p className="text-sm text-muted-foreground">
                    {dayRows.length} dias no calendário.
                  </p>
                </div>
                <DayCogsPanel
                  storeId={String(scoped._id)}
                  storeName={scoped.name}
                  baseCurrency={baseCurrency}
                  inputCurrency={scoped.cogsInputCurrency ?? "EUR"}
                  rows={dayRows}
                />
              </PageTabCard>
            )}
          </>
        }
        csvImport={
          <CogsCsvImport
            stores={stores.map((s) => ({ id: String(s._id), name: s.name }))}
            defaultStoreId={scoped ? String(scoped._id) : undefined}
          />
        }
        variantTable={
          rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {variantStoreIds.length === 0
                ? "Liga uma loja e sincroniza para ver produtos vendidos."
                : "Não há vendas sem custo. O lucro usa o COGS registado."}
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
          )
        }
      />
    </div>
  );
}
