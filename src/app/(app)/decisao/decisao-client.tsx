"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import { useWorkspace } from "@/components/workspace-context";
import { buildMediaBuyerPauseCopyMessage } from "@/lib/campaign-analysis-core";
import type {
  CampaignDecisionAnalysis,
  CampaignDecisionRow,
  CampaignDecisionSection,
  CampaignDecisionViewSection,
  DecisionSummary,
  TodayAction,
} from "@/lib/decision-types";
import { cn } from "@/lib/utils";

function decisionApiUrl(params: URLSearchParams, windowDays: 5 | 7): string {
  const q = new URLSearchParams();
  const store = params.get("store");
  if (store) q.set("store", store);
  q.set("window", String(windowDays));
  return `/api/decision/summary?${q.toString()}`;
}

async function fetchDecision(
  params: URLSearchParams,
  windowDays: 5 | 7,
): Promise<DecisionSummary> {
  const res = await fetch(decisionApiUrl(params, windowDays), { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar decisão.");
  return res.json();
}

function buildPauseMessage(
  analysis: CampaignDecisionAnalysis | null | undefined,
): string | null {
  if (!analysis) return null;
  const pauseSection = analysis.sections.find((s) => s.id === "pause");
  if (!pauseSection?.rows.length) {
    return analysis.mediaBuyerPauseMessage ?? null;
  }
  return (
    buildMediaBuyerPauseCopyMessage(
      pauseSection.rows.map((r) => ({
        name: r.name,
        adAccountName: r.adAccountName,
        hasFullWindow: r.hasFullWindow,
        conversions: r.conversions,
        roasValue: r.roasValue,
        berRoas: r.berRoas,
        pauseCause: r.pauseCause,
      })),
      analysis.windowDays,
    ) ?? analysis.mediaBuyerPauseMessage ?? null
  );
}

function actionDot(level: TodayAction["level"]) {
  if (level === "positive") return "bg-positive";
  if (level === "negative") return "bg-negative";
  return "bg-warning";
}

function fmtConversions(v: number): string {
  if (Math.abs(v - Math.round(v)) < 0.05) return String(Math.round(v));
  return v.toFixed(1).replace(".", ",");
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
          status === "scale" && "border border-positive/30 bg-positive/10 text-positive",
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

function PauseCauseBadge({ cause }: { cause: CampaignDecisionRow["pauseCause"] }) {
  if (!cause) return null;
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium",
        cause === "no_sales"
          ? "border border-negative/30 bg-negative/10 text-negative"
          : "border border-warning/40 bg-warning/10 text-warning",
      )}
    >
      {cause === "no_sales" ? "Sem vendas" : "Abaixo do BER"}
    </span>
  );
}

function fmtMetric(v: number | null, suffix = ""): string {
  if (v == null) return "—";
  return `${v.toFixed(2).replace(".", ",")}${suffix}`;
}

function CopyButton({
  text,
  label,
  variant = "default",
}: {
  text: string;
  label: string;
  variant?: "default" | "primary";
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
        variant === "primary"
          ? "border-negative/30 bg-negative/10 text-negative hover:bg-negative/15"
          : "border-border hover:bg-muted",
      )}
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

function CampaignCard({
  row,
  showPauseCause,
}: {
  row: CampaignDecisionRow;
  showPauseCause?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Sensitive className="font-medium leading-snug">{row.name}</Sensitive>
            {showPauseCause && <PauseCauseBadge cause={row.pauseCause} />}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.adAccountName} · {row.platformLabel}
          </p>
        </div>
        <CampaignStatusBadge status={row.status} label={row.statusLabel} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 lg:grid-cols-5">
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
            <Sensitive>{fmtConversions(row.conversions)}</Sensitive>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ROAS</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            <Sensitive>{row.roas}</Sensitive>
          </dd>
        </div>
        {row.berRoas != null && (
          <div>
            <dt className="text-muted-foreground">BER</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              <Sensitive>{row.berRoas.toFixed(2).replace(".", ",")}x</Sensitive>
            </dd>
          </div>
        )}
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
          {row.postScale && (
            <p className="mt-1 text-muted-foreground">
              <Sensitive>
                Depois ({row.postScale.spendDays} dias): ROAS{" "}
                {row.postScale.roas != null ? `${row.postScale.roas.toFixed(2)}x` : "—"}
                {row.postScale.verdict === "better" && " · melhorou"}
                {row.postScale.verdict === "worse" && " · piorou"}
                {row.postScale.verdict === "same" && " · estável"}
                {row.postScale.verdict === "early" && " · ainda cedo"}
              </Sensitive>
            </p>
          )}
        </div>
      )}

      {row.lastPause && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <p className="font-medium">Pausa em {row.lastPause.dateKey}</p>
          {row.postPauseAccount && (
            <p className="mt-1 text-muted-foreground">
              <Sensitive>
                Depois ({row.postPauseAccount.accountSpendDays} dias): ROAS conta{" "}
                {row.postPauseAccount.accountRoas != null
                  ? `${row.postPauseAccount.accountRoas.toFixed(2)}x`
                  : "—"}
              </Sensitive>
            </p>
          )}
        </div>
      )}

      {row.viewSection !== "pause" && (
        <div className="mt-3 flex justify-end">
          <CopyButton text={row.agentBrief} label="Copiar briefing" />
        </div>
      )}
    </div>
  );
}

function sectionShellClass(id: CampaignDecisionViewSection): string {
  if (id === "pause") return "border-negative/30 bg-negative/5";
  if (id === "performing") return "border-positive/20 bg-surface";
  return "border-border bg-surface";
}

function CampaignSection({
  section,
  pauseMessage,
}: {
  section: CampaignDecisionSection;
  pauseMessage?: string | null;
}) {
  if (!section.rows.length) return null;

  const isPause = section.id === "pause";
  const copyText = isPause ? pauseMessage : null;

  const noSales = section.rows.filter((r) => r.pauseCause === "no_sales");
  const belowBer = section.rows.filter((r) => r.pauseCause === "below_ber");

  return (
    <section className={cn("rounded-lg border", sectionShellClass(section.id))}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{section.description}</p>
          {isPause && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {noSales.length > 0 && (
                <span className="rounded-md border border-negative/20 bg-background px-2 py-0.5">
                  {noSales.length} sem vendas
                </span>
              )}
              {belowBer.length > 0 && (
                <span className="rounded-md border border-warning/30 bg-background px-2 py-0.5">
                  {belowBer.length} abaixo do BER
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {copyText && (
            <CopyButton
              text={copyText}
              label="Copiar mensagem em inglês para o media buyer"
              variant="primary"
            />
          )}
          <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {section.rows.length}
          </span>
        </div>
      </div>

      {isPause && copyText && (
        <div className="border-b border-border bg-background/80 px-5 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Pré-visualização (EN)
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            <Sensitive>{copyText}</Sensitive>
          </p>
        </div>
      )}

      <div className="space-y-3 p-4">
        {isPause ? (
          <>
            {noSales.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sem vendas
                </h3>
                <div className="space-y-3">
                  {noSales.map((row) => (
                    <CampaignCard
                      key={`${row.adAccountId}-${row.campaignId}`}
                      row={row}
                      showPauseCause
                    />
                  ))}
                </div>
              </div>
            )}
            {belowBer.length > 0 && (
              <div className={noSales.length > 0 ? "mt-4" : ""}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Abaixo do break-even
                </h3>
                <div className="space-y-3">
                  {belowBer.map((row) => (
                    <CampaignCard
                      key={`${row.adAccountId}-${row.campaignId}`}
                      row={row}
                      showPauseCause
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          section.rows.map((row) => (
            <CampaignCard key={`${row.adAccountId}-${row.campaignId}`} row={row} />
          ))
        )}
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

  const { data, isError, isLoading } = useQuery<DecisionSummary>({
    queryKey: ["decision-summary", workspaceId, storeId, windowDays],
    queryFn: () => fetchDecision(searchParams, windowDays),
    refetchInterval: 120 * 1000,
  });

  const pauseMessage = buildPauseMessage(data?.campaignAnalysis);

  function setWindow(days: 5 | 7) {
    const q = new URLSearchParams(searchParams);
    q.set("window", String(days));
    router.push(`/decisao?${q.toString()}`);
  }

  const visibleSections = (
    data?.campaignAnalysis?.sections ?? []
  ).filter((s) => s.rows.length > 0);

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
                {data.analysisWindowDays} dias com gasto
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
            {pauseMessage && (
              <CopyButton
                text={pauseMessage}
                label="Copiar mensagem de pausa (EN)"
                variant="primary"
              />
            )}
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
              {data.campaignAnalysis?.campaignCount ?? 0} campanha(s) activas com gasto
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
            visibleSections.length > 0 ? (
              <div className="space-y-5">
                {visibleSections.map((section) => (
                  <CampaignSection
                    key={section.id}
                    section={section}
                    pauseMessage={pauseMessage}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Sem campanhas activas com gasto. Liga uma ad account e sincroniza em Anúncios.
              </p>
            )
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Sem campanhas com gasto. Liga uma ad account e sincroniza em Anúncios.
            </p>
          )}

          {data.recentScales.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold">Histórico de scales</h2>
              <ul className="mt-4 divide-y divide-border">
                {data.recentScales.map((s) => (
                  <li key={`${s.dateKey}-${s.campaignName}`} className="py-3 text-sm">
                    <Sensitive className="font-medium">{s.campaignName}</Sensitive>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <Sensitive>
                        {s.adAccountName} · {s.dateKey} · {s.previousBudget.toFixed(0)} →{" "}
                        {s.newBudget.toFixed(0)} {s.currency}
                      </Sensitive>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.recentPauses.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold">Pausas recentes</h2>
              <ul className="mt-4 divide-y divide-border">
                {data.recentPauses.map((p) => (
                  <li key={`${p.dateKey}-${p.campaignName}`} className="py-3 text-sm">
                    <Sensitive className="font-medium">{p.campaignName}</Sensitive>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <Sensitive>
                        {p.adAccountName} · {p.dateKey}
                        {p.postPause && (
                          <>
                            {" · ROAS conta "}
                            {p.postPause.accountRoas != null
                              ? `${p.postPause.accountRoas.toFixed(2)}x`
                              : "—"}
                          </>
                        )}
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
