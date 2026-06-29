"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { formatDateInput, addDays, startOfDay } from "@/lib/period";
import { periodQueryFromSearchParams } from "@/lib/period";
import { DailyReportCard } from "@/app/(app)/notas/daily-report-card";
import { DailyReportVisualCard } from "@/components/dashboard/daily-report-visual-card";
import { cn } from "@/lib/utils";

type ReportPayload = {
  text: string;
  storeName: string;
  dateKey: string;
  dateLabel: string;
  storeCount?: number;
  multiStore?: boolean;
};

type ReportPeriod = "day" | "week";

type DailyReportPanelProps = {
  /** Omitir para relatório de todas as lojas acessíveis. */
  storeId?: string;
  /** Mostrar aberto por defeito (ex. dashboard consolidada). */
  defaultOpen?: boolean;
};

export function DailyReportPanel({ storeId, defaultOpen = false }: DailyReportPanelProps) {
  const searchParams = useSearchParams();
  const defaultDate = formatDateInput(addDays(startOfDay(new Date()), -1));
  const [open, setOpen] = useState(defaultOpen);
  const [dateKey, setDateKey] = useState(defaultDate);
  const [period, setPeriod] = useState<ReportPeriod>("day");
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [viewMode, setViewMode] = useState<"text" | "visual">("visual");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const multiStore = !storeId;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams(periodQueryFromSearchParams(searchParams));
      if (storeId) {
        q.set("store", storeId);
      } else {
        q.set("all", "1");
      }
      q.set("date", dateKey);
      if (period === "week") q.set("period", "week");
      const res = await fetch(`/api/reports/daily?${q.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ReportPayload & { error?: string };
      if (!res.ok) {
        setReport(null);
        setError(json.error ?? "Não foi possível gerar o resumo.");
        return;
      }
      setReport(json);
      if (multiStore) setViewMode("text");
    } catch {
      setReport(null);
      setError("Erro de rede ao carregar o resumo.");
    } finally {
      setLoading(false);
    }
  }, [dateKey, period, searchParams, storeId, multiStore]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const periodParam = period === "week" ? "&period=week" : "";
  const downloadHref = storeId
    ? `/api/reports/daily?store=${storeId}&date=${dateKey}${periodParam}`
    : `/api/reports/daily?all=1&date=${dateKey}${periodParam}`;

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
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            Resumo
            {multiStore && (
              <span className="text-sm font-normal text-muted-foreground">
                · todas as lojas
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Diário ou semanal — REV, funil, ads (CPC/CTR/CPM), profit
            {multiStore ? " (um bloco por loja)." : "."}
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
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-2">
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setPeriod("day")}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium",
                      period === "day"
                        ? "bg-accent/10 text-accent"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Diário
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriod("week")}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium",
                      period === "week"
                        ? "bg-accent/10 text-accent"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Semanal
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {period === "week"
                    ? multiStore
                      ? "7 dias até à data — um bloco por loja. TXT, PDF ou imprimir."
                      : "Agregado dos 7 dias até à data — TXT, PDF ou imprimir."
                    : multiStore
                      ? "Gera um bloco por loja — TXT, PDF ou imprimir."
                      : "Escolhe o dia — TXT, PDF ou imprimir."}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {period === "week" ? "Último dia da semana" : "Dia do relatório"}
                </label>
                <input
                  type="date"
                  value={dateKey}
                  onChange={(e) => setDateKey(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none focus:border-accent"
                />
              </div>
            </div>

            {loading && (
              <div className="h-40 animate-pulse rounded-lg border border-border bg-muted" />
            )}

            {!loading && error && (
              <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                {error}
              </p>
            )}

            {!loading && report && (
              <div className="space-y-4">
                <div className="flex gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => setViewMode("visual")}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium",
                      viewMode === "visual"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    Cartão
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("text")}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium",
                      viewMode === "text"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    Texto
                  </button>
                </div>
                {viewMode === "visual" ? (
                  <DailyReportVisualCard
                    reportText={report.text}
                    storeName={report.storeName}
                    dateLabel={report.dateLabel}
                    reportPdfHref={`${downloadHref}&format=pdf`}
                  />
                ) : (
                  <DailyReportCard
                    reportText={report.text}
                    storeName={report.storeName}
                    dateLabel={report.dateLabel}
                    downloadBaseHref={downloadHref}
                    compact
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
