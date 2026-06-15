"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Banknote } from "lucide-react";
import { ExportFormatLinks } from "@/components/export-format-links";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Sensitive } from "@/components/privacy-mode";
import { useWorkspace } from "@/components/workspace-context";
import type { PayoutsView } from "@/lib/payouts-data";
import { cn } from "@/lib/utils";

async function fetchPayouts(storeId: string | null): Promise<PayoutsView> {
  const url = storeId
    ? `/api/payouts?store=${encodeURIComponent(storeId)}`
    : "/api/payouts";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar payouts.");
  return res.json();
}

function PayoutsSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="h-14 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[88px] animate-pulse rounded-lg border border-border bg-muted"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-border bg-muted" />
    </div>
  );
}

export function PayoutsClient() {
  const { workspaceId } = useWorkspace();
  const storeId = useSearchParams().get("store");

  const { data, isError, isLoading } = useQuery({
    queryKey: ["payouts", workspaceId, storeId],
    queryFn: () => fetchPayouts(storeId),
    staleTime: 30_000,
  });

  if (isLoading && !data) return <PayoutsSkeleton />;

  if (isError || !data) {
    return (
      <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
        Não foi possível carregar os payouts.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {data.scopeName ? (
            <>
              Payouts · <Sensitive as="span">{data.scopeName}</Sensitive>
            </>
          ) : (
            "Payouts"
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.scopeName ? (
            <>
              Payouts da loja <Sensitive as="span">{data.scopeName}</Sensitive>.
            </>
          ) : (
            "Quanto e quando vais receber do Shopify Payments."
          )}
        </p>
        </div>
        {data.payouts.length > 0 && (
          <ExportFormatLinks
            href={
              storeId
                ? `/api/export/payouts?store=${encodeURIComponent(storeId)}`
                : "/api/export/payouts"
            }
          />
        )}
      </div>

      {data.payoutErrors.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium text-warning">
            Não foi possível obter os payouts de algumas lojas.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Confirma na app Shopify (Dev Dashboard → Configuration) os scopes{" "}
            <code className="text-foreground">read_shopify_payments_payouts</code>{" "}
            e{" "}
            <code className="text-foreground">read_shopify_payments_accounts</code>,
            reinstala a app na loja e sincroniza outra vez.
          </p>
          <ul className="mt-2 space-y-1">
            {data.payoutErrors.map((s) => (
              <li key={s.storeId} className="text-xs text-muted-foreground">
                <Sensitive as="span" className="font-medium text-foreground">
                  {s.name}
                </Sensitive>
                : {s.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data.kpis.map((k) => (
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

      <CollapsibleSection
        title="Histórico de payouts"
        description={
          data.scopeName
            ? `Últimos payouts de ${data.scopeName}.`
            : "Últimos payouts de todas as lojas."
        }
        badge={
          data.payouts.length > 0 ? (
            <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {data.payouts.length}
            </span>
          ) : undefined
        }
        flush
      >
        {data.payouts.length === 0 ? (
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
                {data.payouts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-border hover:bg-muted"
                  >
                    <td className="px-5 py-3 font-medium" data-sensitive>
                      {p.storeName}
                    </td>
                    <td className="px-5 py-3 tabular-nums">
                      {p.issuedAt ?? "—"}
                    </td>
                    <td className={cn("px-5 py-3", p.statusCls)}>
                      {p.statusLabel}
                    </td>
                    <td
                      className="px-5 py-3 text-right tabular-nums text-muted-foreground"
                      data-sensitive
                    >
                      {p.feeFmt}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums" data-sensitive>
                      {p.netFmt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
