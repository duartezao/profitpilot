"use client";

import { Printer } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";

function parseReportLines(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (val) map.set(key, val);
  }
  return map;
}

const KPI_ORDER = [
  "REV",
  "REFUNDS",
  "ADSPEND",
  "DESPESAS",
  "PROFIT",
  "CPC",
  "CTR",
  "CPM",
  "ATC %",
  "REACHED CHECKOUT %",
  "CVR %",
];

export function DailyReportVisualCard({
  reportText,
  storeName,
  dateLabel,
  reportPdfHref,
}: {
  reportText: string;
  storeName: string;
  dateLabel: string;
  reportPdfHref?: string;
}) {
  const fields = parseReportLines(reportText);
  const dayLabel = fields.get("DIA") ?? fields.get("SEMANA") ?? dateLabel;
  const loja = fields.get("LOJA") ?? storeName;

  const kpis = KPI_ORDER.filter((k) => fields.has(k)).map((k) => ({
    label: k,
    value: fields.get(k)!,
  }));

  function printCard() {
    window.print();
  }

  return (
    <div
      id="daily-report-print"
      className="rounded-lg border border-border bg-surface p-5 print:border-0 print:shadow-none"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">Vista para print / partilha</p>
        <button
          type="button"
          onClick={printCard}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Printer className="h-4 w-4" />
          Imprimir
        </button>
        {reportPdfHref && (
          <a
            href={reportPdfHref}
            download
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted print:hidden"
          >
            PDF
          </a>
        )}
      </div>

      <header className="border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          ProfitPilot
        </p>
        <h3 className="mt-1 text-lg font-semibold" data-sensitive>
          {loja}
        </h3>
        <p className="text-sm text-muted-foreground tabular-nums">{dayLabel}</p>
      </header>

      {kpis.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-lg border border-border bg-background p-3"
            >
              <p className="text-xs font-medium text-muted-foreground">
                {k.label}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums" data-sensitive>
                <Sensitive>{k.value}</Sensitive>
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Sem métricas automáticas neste dia.
        </p>
      )}

      <footer className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Gerado a{" "}
        {new Date().toLocaleString("pt-PT", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </footer>
    </div>
  );
}
