import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listStoreOrders } from "@/lib/orders";

export const metadata: Metadata = { title: "Pedidos" };
export const dynamic = "force-dynamic";

export default async function PedidosPage({
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
  if (!storeId) redirect("/dashboard");

  const { rows, stats, storeName, periodLabel } = await listStoreOrders(
    user?.workspaceId ?? "",
    storeId,
    { period, from, to, dates },
  );

  const kpis = [
    { label: "Encomendas", value: String(stats.count) },
    { label: "Receita", value: stats.revenueFmt },
    { label: "AOV", value: stats.aovFmt },
    { label: "Reembolsos", value: stats.refundedFmt },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Pedidos · <span data-sensitive>{storeName || "Loja"}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Encomendas no período · {periodLabel}
        </p>
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
          <ShoppingBag className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Sem encomendas no período.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Altera o período no topo ou sincroniza a loja.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-muted-foreground">
                  <th className="px-5 py-3">Pedido</th>
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Receita</th>
                  <th className="px-5 py-3 text-right">Lucro</th>
                  <th className="px-5 py-3 text-right">Reembolso</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-border hover:bg-muted"
                  >
                    <td className="px-5 py-3 font-medium" data-sensitive>
                      {o.name}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {o.orderDateLabel}
                    </td>
                    <td className="px-5 py-3">{o.financialStatusLabel}</td>
                    <td className="px-5 py-3 text-right tabular-nums" data-sensitive>
                      {o.revenueFmt}
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums ${o.positive ? "text-positive" : "text-negative"}`}
                      data-sensitive
                    >
                      {o.profitFmt}
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums ${o.hasRefund ? "text-negative" : "text-muted-foreground"}`}
                      data-sensitive
                    >
                      {o.refundedFmt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((o) => (
              <div
                key={o.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium" data-sensitive>
                      {o.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {o.orderDateLabel}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {o.financialStatusLabel}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Receita</p>
                    <p className="tabular-nums" data-sensitive>
                      {o.revenueFmt}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lucro</p>
                    <p
                      className={`tabular-nums ${o.positive ? "text-positive" : "text-negative"}`}
                      data-sensitive
                    >
                      {o.profitFmt}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reembolso</p>
                    <p
                      className={`tabular-nums ${o.hasRefund ? "text-negative" : ""}`}
                      data-sensitive
                    >
                      {o.refundedFmt}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
