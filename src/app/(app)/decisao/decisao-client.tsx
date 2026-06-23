"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Sensitive } from "@/components/privacy-mode";
import { ScopeLink } from "@/components/scope-link";
import { useWorkspace } from "@/components/workspace-context";
import {
  periodFromSearchParams,
  periodQueryFromSearchParams,
} from "@/lib/period";
import type { DecisionRow, DecisionSummary, TodayAction } from "@/lib/decision";
import { cn } from "@/lib/utils";

function decisionApiUrl(params: URLSearchParams): string {
  const q = new URLSearchParams(periodQueryFromSearchParams(params));
  const store = params.get("store");
  if (store) q.set("store", store);
  return `/api/decision/summary?${q.toString()}`;
}

async function fetchDecision(params: URLSearchParams): Promise<DecisionSummary> {
  const res = await fetch(decisionApiUrl(params), { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar decisão.");
  return res.json();
}

function actionDot(level: TodayAction["level"]) {
  if (level === "positive") return "bg-positive";
  if (level === "negative") return "bg-negative";
  return "bg-warning";
}

function StatusBadge({ status }: { status: DecisionRow["status"] }) {
  return (
    <Sensitive>
      <span
        className={cn(
          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
          status === "scale" && "border border-positive/30 bg-positive/10 text-positive",
          status === "kill" && "border border-negative/30 bg-negative/10 text-negative",
          status === "maintain" && "border border-border bg-muted text-muted-foreground",
        )}
      >
        {status === "scale" ? "Scale" : status === "kill" ? "Kill" : "Manter"}
      </span>
    </Sensitive>
  );
}

export function DecisaoClient() {
  const { workspaceId } = useWorkspace();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");

  const { data, isError, isLoading } = useQuery({
    queryKey: ["decision-summary", workspaceId, storeId, periodFromSearchParams(searchParams).key],
    queryFn: () => fetchDecision(searchParams),
    refetchInterval: 60 * 1000,
  });

  const isStore = Boolean(data?.scopeName);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Decisão</h1>
        <p className="text-sm text-muted-foreground">
          {isStore ? (
            <>
              O que fazer hoje em{" "}
              <Sensitive as="span">{data?.scopeName}</Sensitive>
              {" · "}
              {data?.periodLabel ?? ""}
            </>
          ) : (
            `Prioridades em todas as lojas · ${data?.periodLabel ?? ""}`
          )}
        </p>
      </div>

      {isError && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          Não foi possível carregar o apoio à decisão.
        </p>
      )}

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-40 animate-pulse rounded-lg border border-border bg-muted" />
          <div className="h-40 animate-pulse rounded-lg border border-border bg-muted" />
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold">O que fazer hoje</h2>
              <ul className="mt-4 space-y-3">
                {data.actions.map((action) => (
                  <li key={action.text} className="flex items-start gap-3 text-sm">
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        actionDot(action.level),
                      )}
                    />
                    <Sensitive>{action.text}</Sensitive>
                  </li>
                ))}
              </ul>
            </div>

            {data.treasury ? (
              <div className="rounded-lg border border-border bg-surface p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Tesouraria</h2>
                  <ScopeLink
                    href="/tesouraria"
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Ver detalhe
                  </ScopeLink>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Disponível</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums" data-sensitive>
                      {data.treasury.available}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">A caminho</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums" data-sensitive>
                      {data.treasury.incoming}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Recebido</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums" data-sensitive>
                      {data.treasury.payable}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Saldo projetado</dt>
                    <dd
                      className="mt-0.5 font-semibold tabular-nums"
                      title={data.treasury.projectedTitle}
                      data-sensitive
                    >
                      {data.treasury.projected}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-surface p-5 text-sm text-muted-foreground">
                Tesouraria indisponível — sincroniza payouts da Shopify.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border p-5">
              <h2 className="text-lg font-semibold">Kill / Scale / Manter</h2>
              <p className="text-sm text-muted-foreground">
                {isStore
                  ? "Por produto no período (ROAS por campanha quando ads API estiver ligada)."
                  : "Por loja no período selecionado."}
              </p>
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted-foreground">
                    <th className="px-5 py-3">
                      {isStore ? "Produto" : "Loja"}
                    </th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3 text-right">ROAS</th>
                    <th className="px-5 py-3 text-right">BER</th>
                    <th className="px-5 py-3 text-right">Margem</th>
                    <th className="px-5 py-3 text-right">Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-8 text-center text-muted-foreground"
                      >
                        Sem dados no período.
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row) => (
                      <tr key={row.name} className="border-t border-border hover:bg-muted">
                        <td className="px-5 py-3 font-medium">
                          <Sensitive>{row.name}</Sensitive>
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          <Sensitive>{row.roas}</Sensitive>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          <Sensitive>{row.ber}</Sensitive>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          <Sensitive>{row.margin}</Sensitive>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          <Sensitive>{row.spend}</Sensitive>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 lg:hidden">
              {data.rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sem dados no período.
                </p>
              ) : (
                data.rows.map((row) => (
                  <div
                    key={row.name}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Sensitive className="font-medium leading-snug">
                        {row.name}
                      </Sensitive>
                      <StatusBadge status={row.status} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">ROAS</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums">
                          <Sensitive>{row.roas}</Sensitive>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">BER</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums">
                          <Sensitive>{row.ber}</Sensitive>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Margem</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums">
                          <Sensitive>{row.margin}</Sensitive>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Gasto</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums">
                          <Sensitive>{row.spend}</Sensitive>
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
