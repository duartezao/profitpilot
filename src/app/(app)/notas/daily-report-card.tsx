"use client";

import { useState } from "react";
import { Copy, Check, FileText } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";

export function DailyReportCard({
  reportText,
  storeName,
  dateLabel,
  compact = false,
}: {
  reportText: string;
  storeName: string;
  dateLabel: string;
  /** Sem cabeçalho duplicado — usado dentro do painel colapsável */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={
        compact
          ? "space-y-3"
          : "space-y-3 rounded-lg border border-border bg-surface p-5"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!compact && (
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Relatório diário
            </h2>
            <p className="text-sm text-muted-foreground">
              <Sensitive>
                {storeName} · {dateLabel}
              </Sensitive>{" "}
              — pronto a copiar.
            </p>
          </div>
        )}
        {compact && (
          <p className="text-sm text-muted-foreground">
            <Sensitive>
              {storeName} · {dateLabel}
            </Sensitive>
          </p>
        )}
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-positive" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copiar
            </>
          )}
        </button>
      </div>
      <pre
        className="max-h-80 overflow-auto rounded-lg border border-border bg-background p-4 text-xs leading-relaxed whitespace-pre-wrap tabular-nums"
        data-sensitive
      >
        {reportText}
      </pre>
    </div>
  );
}
