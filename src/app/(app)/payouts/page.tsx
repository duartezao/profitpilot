import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { storeQueryForUser } from "@/lib/store-scope";
import { canAccessStore } from "@/lib/store-access";
import { Payout } from "@/models/Payout";

export const metadata: Metadata = { title: "Payouts" };
export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  scheduled: "Agendado",
  in_transit: "A caminho",
  paid: "Pago",
  failed: "Falhou",
  canceled: "Cancelado",
};

const statusCls: Record<string, string> = {
  scheduled: "text-warning",
  in_transit: "text-accent",
  paid: "text-positive",
  failed: "text-negative",
  canceled: "text-muted-foreground",
};

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const user = await getCurrentUser();
  const { store: storeId } = await searchParams;
  await connectToDatabase();

  const workspace = user?.workspaceId
    ? await Workspace.findById(user.workspaceId).lean()
    : null;
  const currency = workspace?.baseCurrency ?? "EUR";

  const storeQuery = storeQueryForUser(user!);
  if (storeId && canAccessStore(user!.storeAccess, storeId)) {
    storeQuery._id = storeId;
  }

  const stores = await Store.find(storeQuery)
    .select("name paymentsBalance payoutsError")
    .lean();
  const scopeName = storeId
    ? (stores.find((s) => String(s._id) === storeId)?.name ?? null)
    : null;
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));
  const payoutErrors = stores.filter((s) => s.payoutsError);

  const payoutQuery: Record<string, unknown> = {
    workspaceId: user?.workspaceId,
  };
  if (storeId) payoutQuery.storeId = storeId;

  const payouts = await Payout.find(payoutQuery)
    .sort({ issuedAt: -1 })
    .limit(100)
    .lean();

  const norm = (s?: string | null) => (s ?? "").toLowerCase();
  const saldoAtual = stores.reduce((sum, s) => sum + (s.paymentsBalance ?? 0), 0);
  const aCaminho = payouts
    .filter((p) => ["scheduled", "in_transit"].includes(norm(p.status)))
    .reduce((sum, p) => sum + (p.net ?? 0), 0);
  const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const paid30 = payouts.filter(
    (p) =>
      norm(p.status) === "paid" &&
      p.issuedAt &&
      new Date(p.issuedAt).getTime() >= since30,
  );
  const recebido30 = paid30.reduce((sum, p) => sum + (p.net ?? 0), 0);
  const taxas30 = paid30.reduce((sum, p) => sum + (p.fee ?? 0), 0);

  const kpis = [
    { label: "Saldo atual (por pagar)", value: formatCurrency(saldoAtual, currency) },
    { label: "A caminho", value: formatCurrency(aCaminho, currency) },
    { label: "Recebido (30 dias)", value: formatCurrency(recebido30, currency) },
    { label: "Taxas Shopify (30 dias)", value: formatCurrency(taxas30, currency) },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {scopeName ? (
            <>
              Payouts · <span data-sensitive>{scopeName}</span>
            </>
          ) : (
            "Payouts"
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {scopeName ? (
            <>
              Payouts da loja <span data-sensitive>{scopeName}</span>.
            </>
          ) : (
            "Quanto e quando vais receber do Shopify Payments."
          )}
        </p>
      </div>

      {payoutErrors.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium text-warning">
            Não foi possível obter os payouts de algumas lojas.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirma que a app Shopify tem o scope{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 text-xs">
              read_shopify_payments_accounts
            </code>{" "}
            e reinstala/sincroniza. Detalhe por loja:
          </p>
          <ul className="mt-2 space-y-1">
            {payoutErrors.map((s) => (
              <li key={String(s._id)} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground" data-sensitive>{s.name}</span>:{" "}
                {s.payoutsError}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-border bg-surface p-5">
            <p className="text-[13px] font-medium text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums" data-sensitive>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">Histórico de payouts</h2>
          <p className="text-sm text-muted-foreground">
            Últimos payouts de todas as lojas.
          </p>
        </div>

        {payouts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Banknote className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Ainda não há payouts.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sincroniza uma loja com Shopify Payments para ver os payouts aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-muted-foreground">
                  <th className="px-5 py-3">Loja</th>
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Taxas</th>
                  <th className="px-5 py-3 text-right">Valor líquido</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => {
                  const st = norm(p.status);
                  return (
                    <tr
                      key={String(p._id)}
                      className="border-t border-border hover:bg-muted"
                    >
                      <td className="px-5 py-3 font-medium" data-sensitive>
                        {storeName.get(String(p.storeId)) ?? "—"}
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        {p.issuedAt
                          ? new Date(p.issuedAt).toLocaleDateString("pt-PT")
                          : "—"}
                      </td>
                      <td className={`px-5 py-3 ${statusCls[st] ?? ""}`}>
                        {statusLabel[st] ?? p.status ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground" data-sensitive>
                        {formatCurrency(p.fee ?? 0, p.currency ?? currency)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums" data-sensitive>
                        {formatCurrency(p.net ?? 0, p.currency ?? currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
