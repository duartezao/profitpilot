"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDateInput, addDays, startOfDay } from "@/lib/period";
import { periodQueryFromSearchParams } from "@/lib/period";
import { DailyReportCard } from "@/app/(app)/notas/daily-report-card";

type ReportPayload = {
  text: string;
  storeName: string;
  dateKey: string;
  dateLabel: string;
};

export function DailyReportPanel({ storeId }: { storeId: string }) {
  const searchParams = useSearchParams();
  const defaultDate = formatDateInput(addDays(startOfDay(new Date()), -1));
  const [dateKey, setDateKey] = useState(defaultDate);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
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
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Relatório diário</h2>
          <p className="text-sm text-muted-foreground">
            Template automático — REV, funil, profit — pronto a copiar.
          </p>
        </div>
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
        />
      )}
    </div>
  );
}
