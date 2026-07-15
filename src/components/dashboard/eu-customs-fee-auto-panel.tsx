"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Receipt } from "lucide-react";
import { EU_CUSTOMS_FEE_EFFECTIVE_FROM } from "@/lib/eu-category-fees-types";
import type { EuCustomsFeeAutoSummary } from "@/lib/eu-category-fees-types";
import { Sensitive } from "@/components/privacy-mode";
import { cn } from "@/lib/utils";

function fmt(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

export function EuCustomsFeeAutoPanel({
  summary,
  defaultOpen = false,
}: {
  storeId: string;
  summary: EuCustomsFeeAutoSummary;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50 sm:p-5"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
            Taxa alfandegária UE (automática)
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Win-Win: {summary.feePerOrderEur} € por encomenda paga
            para a UE — soma ao COGS desde {summary.effectiveFrom}.
            Canceladas sem envio são corrigidas no sync.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium text-muted-foreground">
          {open ? (
            <>
              <ChevronUp className="h-4 w-4" />
              <span className="hidden sm:inline">Fechar</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              <span className="hidden sm:inline">Abrir</span>
            </>
          )}
        </span>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 border-t border-border px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
            <p className="text-sm text-muted-foreground">
              Conta automaticamente nas encomendas pagas (report do dia). Se
              forem canceladas ou reembolsadas{" "}
              <strong className="font-medium text-foreground">sem envio</strong>,
              o sync remove a taxa. O mercado UE vem do{" "}
              <strong className="font-medium text-foreground">país das sessões</strong>{" "}
              em Definições (ex. Bélgica = todas as encomendas pagas elegíveis).
              Não precisas de registar faturas do fornecedor.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Últimos 30 dias
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  <Sensitive>
                    {fmt(summary.periodFee, summary.baseCurrency)}
                  </Sensitive>
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary.periodEuOrders} encomenda
                  {summary.periodEuOrders === 1 ? "" : "s"} UE ×{" "}
                  {summary.feePerOrderEur} €
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Vigência
                </p>
                <p className="mt-1 text-sm font-medium">
                  Desde {EU_CUSTOMS_FEE_EFFECTIVE_FROM}
                </p>
                <p className="text-xs text-muted-foreground">
                  Entra no COGS do lucro por dia de venda
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Dias recentes com taxa</p>
              {summary.recentDays.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Ainda sem encomendas UE após {summary.effectiveFrom}.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {summary.recentDays.map((d) => (
                    <li
                      key={d.dateKey}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium tabular-nums">{d.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.euOrders} encomenda{d.euOrders === 1 ? "" : "s"} UE
                        </p>
                      </div>
                      <p className="font-medium tabular-nums">
                        <Sensitive>{fmt(d.amount, d.baseCurrency)}</Sensitive>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
