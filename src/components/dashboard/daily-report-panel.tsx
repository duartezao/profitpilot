"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { formatDateInput, addDays, startOfDay } from "@/lib/period";
import { periodQueryFromSearchParams } from "@/lib/period";
import { DailyReportCard } from "@/app/(app)/notas/daily-report-card";
import { cn } from "@/lib/utils";

type ReportPayload = {
  text: string;
  storeName: string;
  dateKey: string;
  dateLabel: string;
};

export function DailyReportPanel({ storeId }: { storeId: string }) {
  const searchParams = useSearchParams();
  const defaultDate = formatDateInput(addDays(startOfDay(new Date()), -1));
  const [open, setOpen] = useState(false);
  const [dateKey, setDateKey] = useState(defaultDate);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams(periodQueryFromSearchParams(searchParams));
      q.set("store", storeId);
      q.set("date", dateKey);
      const res = await fetch(`/api/reports/daily?${q.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ReportPayload & { error?: string };
      if (!res.ok) {
        setReport(null);
        setError(json.error ?? "Não foi possível gerar o relatório.");
        return;
      }
      setReport(json);
    } catch {
      setReport(null);
      setError("Erro de rede ao carregar o relatório.");
    } finally {
      setLoading(false);
    }
  }, [dateKey, searchParams, storeId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

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
            Relatório diário
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Template automático — REV, funil, profit — pronto a copiar.
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
              <p className="text-sm text-muted-foreground">
                Escolhe o dia e copia o texto para partilhar.
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Dia do relatório
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
              <DailyReportCard
                reportText={report.text}
                storeName={report.storeName}
                dateLabel={report.dateLabel}
                compact
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
