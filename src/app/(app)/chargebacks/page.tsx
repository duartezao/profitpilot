import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ExportFormatLinks } from "@/components/export-format-links";
import { getCurrentUser } from "@/lib/auth";
import { canAccessStore } from "@/lib/store-access";
import { listStoreChargebacks } from "@/lib/chargebacks";
import { scopeQueryFromInput } from "@/lib/scope-query";
import { CollapsibleSection } from "@/components/collapsible-section";

export const metadata: Metadata = { title: "Chargebacks" };
export const dynamic = "force-dynamic";

export default async function ChargebacksPage({
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
  if (!user) redirect("/login");
  const { store: storeId, period, from, to, dates } = await searchParams;
  if (!storeId) redirect("/dashboard");
  if (!canAccessStore(user.storeAccess, storeId)) redirect("/dashboard");

  const { rows, stats, storeName, periodLabel } = await listStoreChargebacks(
    user,
    storeId,
    { period, from, to, dates },
  );

  const kpis = [
    { label: "Chargeback rate", value: stats.chargebackRateFmt },
    { label: "Total disputado", value: stats.totalAmountFmt },
    { label: "Encomendas no período", value: String(stats.ordersInPeriod) },
    { label: "Disputas", value: String(stats.count) },
  ];

  const scopeQs = scopeQueryFromInput({
    period,
    from,
    to,
    dates,
    store: storeId,
  });
  const exportHref = scopeQs
    ? `/api/export/chargebacks?${scopeQs}`
    : `/api/export/chargebacks?store=${storeId}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Chargebacks · <span data-sensitive>{storeName || "Loja"}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Disputas Shopify Payments · {periodLabel}
          </p>
        </div>
        {rows.length > 0 && (
        <ExportFormatLinks href={exportHref} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-lg border border-border bg-surface p-5"
          >
            <p className="text-[13px] font-medium text-muted-foreground">
              {k.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums" data-sensitive>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface p-12 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Sem chargebacks no período.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sincroniza a loja para importar disputas do Shopify Payments.
          </p>
        </div>
      ) : (
        <CollapsibleSection
          title="Lista de disputas"
          description={`${rows.length} chargebacks no período.`}
          badge={
            <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {rows.length}
            </span>
          }
          flush
        >
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface lg:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-muted-foreground">
                  <th className="px-5 py-3">Pedido</th>
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Motivo</th>
                  <th className="px-5 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-border hover:bg-muted"
                  >
                    <td className="px-5 py-3 font-medium" data-sensitive>
                      {r.orderName}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {r.initiatedAtLabel}
                    </td>
                    <td className="px-5 py-3">{r.statusLabel}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {r.reason}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-negative" data-sensitive>
                      {r.amountBaseFmt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium" data-sensitive>
                      {r.orderName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.initiatedAtLabel}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {r.statusLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{r.reason}</p>
                <p className="mt-2 text-sm tabular-nums text-negative" data-sensitive>
                  {r.amountBaseFmt}
                </p>
              </div>
            ))}
          </div>
        </>
        </CollapsibleSection>
      )}
    </div>
  );
}
