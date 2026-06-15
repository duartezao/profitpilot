import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, Boxes } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { canAccessStore } from "@/lib/store-access";
import { buildWorkspacePnl } from "@/lib/metrics";
import { buildWorkspaceTreasury } from "@/lib/treasury";
import { scopeQueryFromInput } from "@/lib/scope-query";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { formatProfitBreakdown } from "@/lib/profit";
import { DataWarnings } from "@/components/dashboard/data-warnings";
import { StoreCashFlowSection } from "@/components/financas/store-cash-flow";

export const metadata: Metadata = { title: "Lucro & Finanças" };
export const dynamic = "force-dynamic";

export default async function FinancasPage({
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
  if (storeId && !canAccessStore(user.storeAccess, storeId)) {
    redirect("/financas");
  }
  const pnl = await buildWorkspacePnl(
    user.workspaceId,
    { period, from, to, dates },
    storeId,
    user.storeAccess,
  );
  const treasury = storeId
    ? await buildWorkspaceTreasury(user.workspaceId, storeId, user.storeAccess)
    : null;
  const storeCash = treasury?.stores[0] ?? null;
  const { totals, stores, currency } = pnl;
  const scopeName =
    storeId && stores.length > 0 ? stores[0].name : null;

  const money = (v: number) => formatCurrency(v, currency);
  const pct = (v: number) => (totals.revenue > 0 ? formatPercent((v / totals.revenue) * 100) : "—");
  const profitDisplay = money(totals.netProfit);
  const profitTitle = formatProfitBreakdown(
    totals,
    totals.adSpend,
    money,
    pnl.cogsIncomplete
      ? { note: pnl.missingCogsMessage.replace(/\.$/, "") }
      : undefined,
  );

  const lines: Array<{
    label: string;
    value: number;
    tone: string;
    share?: number;
  }> = [
    { label: "Receita líquida", value: totals.revenue, tone: "" },
    { label: "COGS", value: -totals.cogs, tone: "text-negative", share: totals.cogs },
    { label: "Envio", value: -totals.shipping, tone: "text-negative", share: totals.shipping },
    { label: "Taxas de transação", value: -totals.fees, tone: "text-negative", share: totals.fees },
    { label: "Ad Spend", value: -totals.adSpend, tone: "text-negative", share: totals.adSpend },
  ];
  if (totals.refunds > 0) {
    lines.push({
      label: "Reembolsos (já na receita)",
      value: totals.refunds,
      tone: "text-muted-foreground",
      share: totals.refunds,
    });
  }

  const scopeQs = scopeQueryFromInput({ period, from, to, dates, store: storeId });
  const cogsHref = scopeQs ? `/cogs?${scopeQs}` : "/cogs";
  const adsHref = scopeQs ? `/anuncios?${scopeQs}` : "/anuncios";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {scopeName ? (
            <>
              Resumo · <span data-sensitive>{scopeName}</span>
            </>
          ) : (
            "Lucro & Finanças"
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {scopeName
            ? `Caixa acumulada e P&L do período · ${pnl.periodLabel}.`
            : `P&L real · ${pnl.periodLabel}.`}
        </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={cogsHref}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Boxes className="h-4 w-4" />
            COGS
          </Link>
          <Link
            href={adsHref}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Megaphone className="h-4 w-4" />
            Ad Spend
          </Link>
        </div>
      </div>

      <DataWarnings
        cogsIncomplete={pnl.cogsIncomplete}
        missingCogsCount={pnl.missingCogsCount}
        missingCogsMessage={pnl.missingCogsMessage}
        missingAdSpendDays={pnl.missingAdSpendDays}
        cogsHref={cogsHref}
        adsHref={adsHref}
      />

      {storeCash && <StoreCashFlowSection cash={storeCash} />}

      <div>
        <h2 className="text-lg font-semibold">
          {scopeName ? "Lucro do período" : "Resumo do período"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Métricas do intervalo seleccionado na topbar — independente do saldo
          acumulado acima.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[13px] font-medium text-muted-foreground">Receita</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums" data-sensitive>
            {money(totals.revenue)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[13px] font-medium text-muted-foreground">Custos totais</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums" data-sensitive>
            {money(totals.cogs + totals.shipping + totals.fees + totals.adSpend)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[13px] font-medium text-muted-foreground">Lucro líquido</p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${totals.netProfit >= 0 ? "text-positive" : "text-negative"}`}
            title={profitTitle}
            data-sensitive
          >
            {profitDisplay}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[13px] font-medium text-muted-foreground">Margem</p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${totals.margin >= 0 ? "" : "text-negative"}`}
            data-sensitive
          >
            {formatPercent(totals.margin)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">Demonstração de resultados</h2>
          <p className="text-sm text-muted-foreground">
            Onde está a ir o dinheiro (peso sobre a receita).
          </p>
        </div>
        <div className="divide-y divide-border">
          {lines.map((l) => (
            <div key={l.label} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm">{l.label}</span>
              <div className="flex items-center gap-4">
                {"share" in l && l.share !== undefined && (
                  <span
                    className="w-12 text-right text-xs text-muted-foreground tabular-nums"
                    data-sensitive
                  >
                    {pct(l.share)}
                  </span>
                )}
                <span
                  className={`w-32 text-right text-sm tabular-nums ${l.tone}`}
                  data-sensitive
                >
                  {money(l.value)}
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between bg-muted px-5 py-3">
            <span className="text-sm font-semibold">Lucro líquido</span>
            <span
              className={`w-32 text-right text-sm font-semibold tabular-nums ${totals.netProfit >= 0 ? "text-positive" : "text-negative"}`}
              title={profitTitle}
              data-sensitive
            >
              {profitDisplay}
            </span>
          </div>
        </div>
      </div>

      {!scopeName && (
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">Por loja</h2>
          <p className="text-sm text-muted-foreground">Lucro real de cada loja.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="px-5 py-3">Loja</th>
                <th className="px-5 py-3 text-right">Receita</th>
                <th className="px-5 py-3 text-right">COGS</th>
                <th className="px-5 py-3 text-right">Ad Spend</th>
                <th className="px-5 py-3 text-right">Taxas</th>
                <th className="px-5 py-3 text-right">Reembolsos</th>
                <th className="px-5 py-3 text-right">Lucro</th>
                <th className="px-5 py-3 text-right">Margem</th>
              </tr>
            </thead>
            <tbody>
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Sem dados ainda. Liga e sincroniza uma loja para ver o lucro real.
                  </td>
                </tr>
              ) : (
                stores.map((s) => (
                  <tr key={s.name} className="border-t border-border hover:bg-muted">
                    <td className="px-5 py-3 font-medium" data-sensitive>
                      {s.name}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums" data-sensitive>
                      {money(s.revenue)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums" data-sensitive>
                      {money(s.cogs)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums" data-sensitive>
                      {money(s.adSpend)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums" data-sensitive>
                      {money(s.fees)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums" data-sensitive>
                      {money(s.refunds)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums ${s.netProfit >= 0 ? "text-positive" : "text-negative"}`}
                      data-sensitive
                    >
                      {money(s.netProfit)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums ${s.margin >= 0 ? "" : "text-negative"}`}
                      data-sensitive
                    >
                      {formatPercent(s.margin)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
