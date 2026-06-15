import { Eye } from "lucide-react";
import { ScopeLink } from "@/components/scope-link";
import { Sensitive } from "@/components/privacy-mode";
import type { StoreDailyMetricRow } from "@/lib/metrics";

function NoteIcon({
  storeId,
  preview,
}: {
  storeId: string;
  preview?: string;
}) {
  return (
    <span title={preview ? `Nota: ${preview}` : "Ver nota do dia"}>
      <ScopeLink
        href={`/notas?store=${encodeURIComponent(storeId)}`}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-accent"
      >
        <Eye className="h-3.5 w-3.5" />
      </ScopeLink>
    </span>
  );
}

function DayCell({
  row,
  storeId,
}: {
  row: StoreDailyMetricRow;
  storeId: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="tabular-nums whitespace-nowrap">{row.dateLabel}</span>
      {row.hasNote && (
        <NoteIcon storeId={storeId} preview={row.notePreview} />
      )}
    </div>
  );
}

function MetricValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`truncate tabular-nums text-sm ${tone ?? ""}`}>
        <Sensitive>{value}</Sensitive>
      </p>
    </div>
  );
}

export function StoreDailyMetricsTable({
  rows,
  storeUrl,
  storeId,
}: {
  rows: StoreDailyMetricRow[];
  storeUrl: string | null;
  storeId: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground sm:p-5">
        Sem dados neste período.
      </p>
    );
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-5 py-3">Dia</th>
              {storeUrl && <th className="px-5 py-3">Loja</th>}
              <th className="px-5 py-3 text-right">REV</th>
              <th className="px-5 py-3 text-right">COGS</th>
              <th className="px-5 py-3 text-right">Refunds</th>
              <th className="px-5 py-3 text-right">Ad Spend</th>
              <th className="px-5 py-3 text-right">Net Profit</th>
              <th className="px-5 py-3 text-right">Sessões</th>
              <th className="px-5 py-3 text-right">ATC %</th>
              <th className="px-5 py-3 text-right">Checkout %</th>
              <th className="px-5 py-3 text-right">CVR %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.dateKey}
                className="border-t border-border hover:bg-muted/50"
              >
                <td className="px-5 py-3">
                  <DayCell row={row} storeId={storeId} />
                </td>
                {storeUrl && (
                  <td className="max-w-[140px] truncate px-5 py-3 text-muted-foreground">
                    <Sensitive>{storeUrl}</Sensitive>
                  </td>
                )}
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{row.revenue}</Sensitive>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{row.cogs}</Sensitive>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{row.refunds}</Sensitive>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{row.adSpend}</Sensitive>
                </td>
                <td
                  className={`px-5 py-3 text-right tabular-nums ${row.profitPositive ? "text-positive" : "text-negative"}`}
                  title={row.profitTitle}
                >
                  <Sensitive>{row.profit}</Sensitive>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>
                    {row.sessions != null
                      ? row.sessions.toLocaleString("pt-PT")
                      : "—"}
                  </Sensitive>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{row.atcPct}</Sensitive>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{row.checkoutPct}</Sensitive>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <Sensitive>{row.cvrPct}</Sensitive>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — cartões */}
      <div className="space-y-3 p-4 md:hidden">
        {rows.map((row) => (
          <div
            key={row.dateKey}
            className="rounded-lg border border-border bg-background p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <DayCell row={row} storeId={storeId} />
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${row.profitPositive ? "text-positive" : "text-negative"}`}
                title={row.profitTitle}
              >
                <Sensitive>{row.profit}</Sensitive>
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <MetricValue label="REV" value={row.revenue} />
              <MetricValue label="COGS" value={row.cogs} />
              <MetricValue label="Ad spend" value={row.adSpend} />
              <MetricValue label="Refunds" value={row.refunds} />
              <MetricValue
                label="Sessões"
                value={
                  row.sessions != null
                    ? row.sessions.toLocaleString("pt-PT")
                    : "—"
                }
              />
              <MetricValue label="ATC %" value={row.atcPct} />
              <MetricValue label="Checkout %" value={row.checkoutPct} />
              <MetricValue label="CVR %" value={row.cvrPct} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
