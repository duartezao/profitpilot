"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Wallet, Settings, AlertTriangle } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import { ScopeLink } from "@/components/scope-link";
import type { IncomingDayLine, WorkspaceTreasury } from "@/lib/treasury";
import { useWorkspace } from "@/components/workspace-context";
import { KpiCard } from "@/components/ui/kpi-card";

async function fetchTreasury(storeId: string | null): Promise<WorkspaceTreasury> {
  const url = storeId
    ? `/api/metrics/treasury?store=${encodeURIComponent(storeId)}`
    : "/api/metrics/treasury";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar tesouraria.");
  return res.json();
}

function IncomingTimeline({
  lines,
  emptyLabel,
}: {
  lines: IncomingDayLine[];
  emptyLabel: string;
}) {
  if (lines.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {lines.map((line) => (
        <li
          key={`${line.date}-${line.kind}`}
          className="flex items-center justify-between gap-4 px-5 py-3"
        >
          <div className="min-w-0">
            <p className="font-medium tabular-nums">{line.dateLabel}</p>
            <p className="text-xs text-muted-foreground">{line.kindLabel}</p>
          </div>
          <span className="shrink-0 tabular-nums font-medium" data-sensitive>
            {line.amountFmt}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TreasuryClient() {
  const { workspaceId } = useWorkspace();
  const storeId = useSearchParams().get("store");
  const { data, isError, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["treasury", workspaceId, storeId],
    queryFn: () => fetchTreasury(storeId),
    refetchInterval: 15 * 1000,
  });

  const scopeStore = storeId
    ? data?.stores.find((s) => s.storeId === storeId)
    : null;

  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("pt-PT")
    : null;

  const payoutErrors = data?.stores.filter((s) => s.payoutsError) ?? [];

  const view = scopeStore ?? data?.totals;

  const kpis = view
    ? scopeStore
      ? [
          {
            label: "Por pagar (Shopify)",
            value: scopeStore.availableFmt,
            title: scopeStore.availableFmt,
          },
          {
            label: "A caminho",
            value: scopeStore.incomingFmt,
            title: scopeStore.incomingFmt,
          },
          {
            label: "Recebido",
            value: scopeStore.receivedFmt,
            title: scopeStore.receivedFmt,
          },
          {
            label: "Saldo projetado",
            value: scopeStore.projectedFmt,
            title: scopeStore.projectedTitle,
          },
        ]
      : [
          {
            label: "Por pagar (Shopify)",
            value: data!.totals.availableFmt,
            title: data!.totals.availableFmt,
          },
          {
            label: "A caminho",
            value: data!.totals.incomingFmt,
            title: data!.totals.incomingFmt,
          },
          {
            label: "Recebido",
            value: data!.totals.receivedFmt,
            title: data!.totals.receivedFmt,
          },
          {
            label: "Saldo projetado",
            value: data!.totals.projectedFmt,
            title: data!.totals.projectedTitle,
          },
        ]
    : [];

  const incomingLines = scopeStore
    ? scopeStore.incomingByDay
    : (data?.incomingByDay ?? []);

  const receivedLines = scopeStore
    ? scopeStore.receivedByDay
    : (data?.receivedByDay ?? []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {scopeStore ? (
              <Sensitive as="span">{scopeStore.storeName}</Sensitive>
            ) : (
              "Tesouraria"
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Caixa real — o que tens, o que vem e o que já recebeste.
            {scopeStore?.startingBalanceDate && (
              <>
                {" "}
                Saldo inicial desde{" "}
                {new Date(scopeStore.startingBalanceDate).toLocaleDateString(
                  "pt-PT",
                )}
                .
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span
                className={
                  isFetching
                    ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75"
                    : "hidden"
                }
              />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
            </span>
            {updatedAt ? `Ao vivo · ${updatedAt}` : "A ligar…"}
          </span>
          <ScopeLink
            href="/definicoes"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Settings className="h-4 w-4" />
            Saldo inicial
          </ScopeLink>
        </div>
      </div>

      {isError && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          Não foi possível carregar a tesouraria. A tentar novamente…
        </p>
      )}

      {payoutErrors.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Dados Shopify incompletos — sincroniza a loja
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {payoutErrors.map((s) => (
              <li key={s.storeId}>
                <Sensitive as="span" className="font-medium text-foreground">
                  {s.storeName}
                </Sensitive>
                : {s.payoutsError}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!data || data.stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface p-12 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Sem lojas ligadas.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Adiciona uma loja e sincroniza para ver a tesouraria.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {kpis.length > 0
              ? kpis.map((k) => (
                  <KpiCard
                    key={k.label}
                    label={k.label}
                    value={k.value}
                    title={k.title}
                  />
                ))
              : Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[100px] animate-pulse rounded-lg border border-border bg-muted"
                  />
                ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Saldo projetado = saldo inicial + recebido + por pagar (Shopify) + a
            caminho. Quando a Shopify marca o payout como pago (após sync), o
            valor passa de «a caminho» para «recebido» e o projetado atualiza.
          </p>

          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border p-5">
              <h2 className="text-lg font-semibold">Recebido, por dia</h2>
              <p className="text-sm text-muted-foreground">
                Payouts já na conta — atualiza após sincronizar a loja.
              </p>
            </div>
            <IncomingTimeline
              lines={receivedLines}
              emptyLabel="Ainda sem payouts recebidos neste período."
            />
          </div>

          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border p-5">
              <h2 className="text-lg font-semibold">A caminho, por dia</h2>
              <p className="text-sm text-muted-foreground">
                Payouts agendados e vendas pendentes — totais por dia, não por
                transação.
              </p>
            </div>
            <IncomingTimeline
              lines={incomingLines}
              emptyLabel="Nada a caminho. Sincroniza a loja para atualizar."
            />
          </div>

          {!scopeStore && (
            <div className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border p-5">
                <h2 className="text-lg font-semibold">Por loja</h2>
                <p className="text-sm text-muted-foreground">
                  Resumo de caixa por loja.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-muted-foreground">
                      <th className="px-5 py-3">Loja</th>
                      <th className="px-5 py-3 text-right">Por pagar</th>
                      <th className="px-5 py-3 text-right">A caminho</th>
                      <th className="px-5 py-3 text-right">Recebido</th>
                      <th className="px-5 py-3 text-right">Projetado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stores.map((s) => (
                      <tr
                        key={s.storeId}
                        className="border-t border-border hover:bg-muted"
                      >
                        <td className="px-5 py-3 font-medium">
                          <Sensitive>{s.storeName}</Sensitive>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums" data-sensitive>
                          {s.availableFmt}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums" data-sensitive>
                          {s.incomingFmt}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums" data-sensitive>
                          {s.receivedFmt}
                        </td>
                        <td
                          className="px-5 py-3 text-right tabular-nums"
                          title={s.projectedTitle}
                          data-sensitive
                        >
                          {s.projectedFmt}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
