"use client";

import Link from "next/link";
import { Settings, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { StoreTreasuryLine } from "@/lib/treasury";
import { ScopeLink } from "@/components/scope-link";
import { CollapsibleSection } from "@/components/collapsible-section";

export function StoreCashFlowSection({
  cash,
  settingsHref = "/definicoes",
  treasuryHref = "/tesouraria",
  embedded = false,
}: {
  cash: StoreTreasuryLine;
  settingsHref?: string;
  treasuryHref?: string;
  embedded?: boolean;
}) {
  const entries = [
    { label: "Saldo inicial", value: cash.startingBalanceFmt, tone: "" },
    { label: "Payouts recebidos", value: cash.receivedFmt, tone: "text-positive" },
    ...(cash.manualIn > 0
      ? [
          {
            label: "Capital injectado",
            value: `+${cash.manualInFmt}`,
            tone: "text-positive",
          },
        ]
      : []),
    { label: "COGS", value: `−${cash.outflowsCogsFmt}`, tone: "text-negative" },
    { label: "Envio", value: `−${cash.outflowsShippingFmt}`, tone: "text-negative" },
    { label: "Ad Spend", value: `−${cash.outflowsAdSpendFmt}`, tone: "text-negative" },
    ...(cash.manualOut > 0
      ? [
          {
            label: "Levantamentos",
            value: `−${cash.manualOutFmt}`,
            tone: "text-negative",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Caixa da loja</h2>
            <p className="text-sm text-muted-foreground">
              Desde {cash.sinceLabel}
              {cash.startingBalanceDate
                ? ` · saldo inicial em ${new Date(cash.startingBalanceDate).toLocaleDateString("pt-PT")}`
                : ""}
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ScopeLink
              href={settingsHref}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Settings className="h-4 w-4" />
              Saldo inicial
            </ScopeLink>
            <ScopeLink
              href={`${settingsHref}#capital-negocio`}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Injetar capital
            </ScopeLink>
            <ScopeLink
              href={treasuryHref}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Ver tesouraria
            </ScopeLink>
          </div>
        </div>
      )}

      {embedded && (
        <div className="flex flex-wrap gap-2">
          <ScopeLink
            href={settingsHref}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Settings className="h-4 w-4" />
            Saldo inicial
          </ScopeLink>
          <ScopeLink
            href={treasuryHref}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Ver tesouraria
          </ScopeLink>
        </div>
      )}

      {cash.payoutsError && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Payouts incompletos — sincroniza a loja para actualizar entradas.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <p className="text-[13px] font-medium text-muted-foreground">
            Saldo em conta
          </p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${cash.cashOnHand >= 0 ? "text-positive" : "text-negative"}`}
            title={cash.cashOnHandTitle}
            data-sensitive
          >
            {cash.cashOnHandFmt}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Inicial + recebido + capital − COGS − envio − ads − levantamentos
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <p className="text-[13px] font-medium text-muted-foreground">
            A receber (Shopify)
          </p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums"
            title={cash.shopifyPendingTitle}
            data-sensitive
          >
            {cash.shopifyPendingFmt}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Por pagar + a caminho
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
            <ArrowDownLeft className="h-3.5 w-3.5" />
            Entrou
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-positive" data-sensitive>
            {cash.receivedFmt}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Payouts na conta</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Saiu
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-negative" data-sensitive>
            {cash.outflowsTotalFmt}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">COGS, envio e ads</p>
        </div>
      </div>

      <CollapsibleSection
        title="Movimento de caixa"
        description="Entradas e saídas desde o saldo inicial."
        flush
      >
        <div className="divide-y divide-border">
          {entries.map((e) => (
            <div
              key={e.label}
              className="flex items-center justify-between px-4 py-3 sm:px-5"
            >
              <span className="text-sm">{e.label}</span>
              <span
                className={`text-sm tabular-nums font-medium ${e.tone}`}
                data-sensitive
              >
                {e.value}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between bg-muted px-4 py-3 sm:px-5">
            <span className="text-sm font-semibold">Saldo em conta</span>
            <span
              className={`text-sm font-semibold tabular-nums ${cash.cashOnHand >= 0 ? "text-positive" : "text-negative"}`}
              title={cash.cashOnHandTitle}
              data-sensitive
            >
              {cash.cashOnHandTitle}
            </span>
          </div>
        </div>
      </CollapsibleSection>

      {cash.receivedByDay.length > 0 && (
        <CollapsibleSection
          title="Últimos payouts recebidos"
          description={`${cash.receivedByDay.length} entradas recentes.`}
          flush
        >
          <ul className="divide-y divide-border">
            {cash.receivedByDay.slice(0, 8).map((line) => (
              <li
                key={line.date}
                className="flex items-center justify-between px-4 py-3 sm:px-5"
              >
                <span className="text-sm tabular-nums">{line.dateLabel}</span>
                <span className="text-sm font-medium tabular-nums text-positive" data-sensitive>
                  +{line.amountFmt}
                </span>
              </li>
            ))}
          </ul>
          {cash.receivedByDay.length > 8 && (
            <p className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground sm:px-5">
              <Link href={treasuryHref} className="font-medium hover:underline">
                Ver todos em Tesouraria
              </Link>
            </p>
          )}
        </CollapsibleSection>
      )}

      <p className="text-xs text-muted-foreground">
        Caixa ≠ lucro. O lucro abaixo é do período seleccionado; o saldo em conta
        acumula desde o início da loja. Taxas Shopify já vêm líquidas nos payouts.
      </p>
    </div>
  );
}
