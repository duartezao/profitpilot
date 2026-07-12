"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import { useWorkspace } from "@/components/workspace-context";
import type {
  CampaignDecisionRow,
  CampaignDecisionSection,
  DecisionSummary,
  TodayAction,
} from "@/lib/decision-types";
import { cn } from "@/lib/utils";

function decisionApiUrl(params: URLSearchParams): string {
  const q = new URLSearchParams();
  const store = params.get("store");
  if (store) q.set("store", store);
  const window = params.get("window");
  if (window === "5" || window === "7") q.set("window", window);
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

function CampaignStatusBadge({
  status,
  label,
}: {
  status: CampaignDecisionRow["status"];
  label: string;
}) {
  return (
    <Sensitive>
      <span
        className={cn(
          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
          (status === "scale") &&
            "border border-positive/30 bg-positive/10 text-positive",
          (status === "kill" || status === "pause") &&
            "border border-negative/30 bg-negative/10 text-negative",
          status === "testing" &&
            "border border-warning/30 bg-warning/10 text-warning",
          status === "maintain" &&
            "border border-border bg-muted text-muted-foreground",
        )}
      >
        {label}
      </span>
    </Sensitive>
  );
}

function fmtMetric(v: number | null, suffix = ""): string {
  if (v == null) return "—";
  return `${v.toFixed(2).replace(".", ",")}${suffix}`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
      title={label}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-positive" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function CampaignCard({ row }: { row: CampaignDecisionRow }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Sensitive className="font-medium leading-snug">{row.name}</Sensitive>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.adAccountName} · {row.platformLabel}
          </p>
        </div>
        <CampaignStatusBadge status={row.status} label={row.statusLabel} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Dias c/ gasto</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            <Sensitive>
              {row.spendDays}/{row.spendDaysRequired}
            </Sensitive>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Gasto</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            <Sensitive>{row.spend.toFixed(2).replace(".", ",")}</Sensitive>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Conv.</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            <Sensitive>{row.conversions}</Sensitive>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ROAS</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            <Sensitive>{row.roas}</Sensitive>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">CPC</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            <Sensitive>{fmtMetric(row.cpc)}</Sensitive>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">CTR</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            <Sensitive>{fmtMetric(row.ctr, "%")}</Sensitive>
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        <Sensitive>{row.reason}</Sensitive>
      </p>

      {row.lastScale && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <p className="font-medium">
            Scale em {row.lastScale.dateKey}:{" "}
            <Sensitive>
              {row.lastScale.fromBudget.toFixed(0)} → {row.lastScale.toBudget.toFixed(0)}{" "}
              {row.lastScale.currency}
            </Sensitive>
          </p>
          <p className="mt-1 text-muted-foreground">
            <Sensitive>
              Antes do scale: {row.lastScale.preSpendDays} dias · gasto{" "}
              {row.lastScale.preSpend.toFixed(2)} · {row.lastScale.preConversions} conv. · ROAS{" "}
              {row.lastScale.preRoas != null
                ? `${row.lastScale.preRoas.toFixed(2)}x`
                : "—"}
            </Sensitive>
          </p>
          {row.postScale && (
            <p className="mt-1 text-muted-foreground">
              <Sensitive>
                Depois ({row.postScale.spendDays} dias): gasto {row.postScale.spend.toFixed(2)} ·{" "}
                {row.postScale.conversions} conv. · ROAS{" "}
                {row.postScale.roas != null ? `${row.postScale.roas.toFixed(2)}x` : "—"}
                {row.postScale.verdict === "better" && " · melhorou"}
                {row.postScale.verdict === "worse" && " · piorou"}
                {row.postScale.verdict === "same" && " · estável"}
                {row.postScale.verdict === "early" && " · ainda cedo para avaliar"}
              </Sensitive>
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <CopyButton text={row.agentBrief} label="Copiar briefing para o agente" />
      </div>
    </div>
  );
}

function CampaignSection({ section }: { section: CampaignDecisionSection }) {
  if (!section.rows.length) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">{section.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma campanha nesta categoria.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{section.description}</p>
        </div>
        <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {section.rows.length}
        </span>
      </div>
      <div className="space-y-3 p-4">
        {section.rows.map((row) => (
          <CampaignCard key={`${row.adAccountId}-${row.campaignId}`} row={row} />
        ))}
      </div>
    </section>
  );
}

export function DecisaoClient() {
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("store");
  const windowDays = searchParams.get("window") === "5" ? 5 : 7;

  const { data, isError, isLoading } = useQuery({
    queryKey: ["decision-summary", workspaceId, storeId, windowDays],
    queryFn: () => fetchDecision(searchParams),
    refetchInterval: 120 * 1000,
  });

  function setWindow(days: 5 | 7) {
    const q = new URLSearchParams(searchParams);
    q.set("window", String(days));
    router.push(`/decisao?${q.toString()}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Decisão — Campanhas</h1>
          <p className="text-sm text-muted-foreground">
            {data?.scopeName ? (
              <>
                <Sensitive as="span">{data.scopeName}</Sensitive>
                {" · "}
                {data.analysisWindowDays} dias com gasto (dados completos)
              </>
            ) : (
              "Seleciona uma loja para analisar campanhas."
            )}
          </p>
        </div>

        {storeId && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setWindow(7)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  windowDays === 7 ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                7 dias
              </button>
              <button
                type="button"
                onClick={() => setWindow(5)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  windowDays === 5 ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                5 dias
              </button>
            </div>
            {data?.agentExport && (
              <CopyButton text={data.agentExport} label="Copiar análise completa" />
            )}
          </div>
        )}
      </div>

      {!storeId && (
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
          Escolhe uma loja no topo para ver a análise de campanhas por ad account.
        </p>
      )}

      {isError && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          Não foi possível carregar a análise.
        </p>
      )}

      {isLoading && storeId && (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-lg border border-border bg-muted" />
          <div className="h-48 animate-pulse rounded-lg border border-border bg-muted" />
        </div>
      )}

      {data && storeId && (
        <>
          {data.storeBerRoas && (
            <p className="text-sm text-muted-foreground">
              BER loja: <span className="font-medium tabular-nums">{data.storeBerRoas}x</span>
              {" · "}
              {data.campaignAnalysis?.campaignCount ?? 0} campanha(s) com gasto registado
            </p>
          )}

          {data.actions.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold">Resumo rápido</h2>
              <ul className="mt-3 space-y-2">
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
          )}

          {data.campaignAnalysis ? (
            <div className="space-y-5">
              {data.campaignAnalysis.sections.map((section) => (
                <CampaignSection key={section.id} section={section} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Sem campanhas com gasto. Liga uma ad account e sincroniza em Anúncios.
            </p>
          )}

          {data.recentScales.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold">Histórico de scales</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Budgets que subiram (detetado no sync da API).
              </p>
              <ul className="mt-4 divide-y divide-border">
                {data.recentScales.map((s) => (
                  <li key={`${s.dateKey}-${s.campaignName}`} className="py-3 text-sm">
                    <Sensitive className="font-medium">{s.campaignName}</Sensitive>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <Sensitive>
                        {s.adAccountName} · {s.dateKey} · {s.previousBudget.toFixed(0)} →{" "}
                        {s.newBudget.toFixed(0)} {s.currency}
                        {s.preRoas != null && ` · ROAS pré-scale ${s.preRoas.toFixed(2)}x`}
                      </Sensitive>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
