"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import type { WorkspaceTreasury } from "@/lib/treasury";
import { ScopeLink } from "@/components/scope-link";
import { Sensitive } from "@/components/privacy-mode";
import { cn } from "@/lib/utils";

export function ConsolidatedCashSection({
  treasury,
}: {
  treasury: WorkspaceTreasury;
}) {
  const { totals, stores } = treasury;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Banca (todas as lojas)</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Projecção por loja (não é o saldo do banco). Soma saldos iniciais +
            payouts − COGS − ads − despesas. Se as lojas partilham a mesma
            conta, os saldos iniciais somam-se e o total fica artificialmente
            alto.
          </p>
        </div>
        <ScopeLink
          href="/tesouraria"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Wallet className="h-4 w-4" />
          Ver tesouraria
        </ScopeLink>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-accent/30 bg-background p-4 sm:col-span-2 sm:p-5 lg:col-span-1">
          <p className="text-[13px] font-medium text-muted-foreground">
            Saldo em conta
          </p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              totals.cashOnHand >= 0 ? "text-positive" : "text-negative",
            )}
            title={totals.cashOnHandTitle}
            data-sensitive
          >
            {totals.cashOnHandFmt}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Soma das lojas · o que era suposto ter em banca
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4 sm:p-5">
          <p className="text-[13px] font-medium text-muted-foreground">
            Com a receber
          </p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums"
            title={totals.projectedCashTitle}
            data-sensitive
          >
            {totals.projectedCashFmt}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Em conta + Shopify por pagar
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4 sm:p-5">
          <p className="text-[13px] font-medium text-muted-foreground">
            Já entrou
          </p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums text-positive"
            data-sensitive
          >
            {totals.receivedFmt}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Payouts recebidos</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4 sm:p-5">
          <p className="text-[13px] font-medium text-muted-foreground">
            Já saiu
          </p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums text-negative"
            data-sensitive
          >
            {totals.outflowsTotalFmt}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            COGS, envio, ads e despesas
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3 sm:px-5">Loja</th>
                <th className="px-4 py-3 text-right sm:px-5">Saldo em conta</th>
                <th className="px-4 py-3 text-right sm:px-5">A receber</th>
                <th className="px-4 py-3 text-right sm:px-5">Projectado</th>
                <th className="px-4 py-3 text-right sm:px-5">Desde</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr
                  key={s.storeId}
                  className="border-t border-border hover:bg-muted/60"
                >
                  <td className="px-4 py-3 font-medium sm:px-5">
                    <Link
                      href={`/financas?store=${encodeURIComponent(s.storeId)}`}
                      className="hover:text-accent"
                    >
                      <Sensitive>{s.storeName}</Sensitive>
                    </Link>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums font-medium sm:px-5",
                      s.cashOnHand >= 0 ? "text-positive" : "text-negative",
                    )}
                    title={s.cashOnHandTitle}
                    data-sensitive
                  >
                    {s.cashOnHandFmt}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums sm:px-5"
                    data-sensitive
                  >
                    {s.shopifyPendingFmt}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums sm:px-5"
                    title={s.projectedCashTitle}
                    data-sensitive
                  >
                    {s.projectedCashFmt}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground sm:px-5">
                    {s.sinceLabel}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40">
                <td className="px-4 py-3 text-sm font-semibold sm:px-5">
                  Total
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right text-sm font-semibold tabular-nums sm:px-5",
                    totals.cashOnHand >= 0 ? "text-positive" : "text-negative",
                  )}
                  title={totals.cashOnHandTitle}
                  data-sensitive
                >
                  {totals.cashOnHandFmt}
                </td>
                <td
                  className="px-4 py-3 text-right text-sm font-semibold tabular-nums sm:px-5"
                  data-sensitive
                >
                  {totals.shopifyPendingFmt}
                </td>
                <td
                  className="px-4 py-3 text-right text-sm font-semibold tabular-nums sm:px-5"
                  title={totals.projectedCashTitle}
                  data-sensitive
                >
                  {totals.projectedCashFmt}
                </td>
                <td className="px-4 py-3 sm:px-5" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
