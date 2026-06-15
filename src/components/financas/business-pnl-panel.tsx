import { formatCurrency, formatPercent } from "@/lib/utils";
import type { buildWorkspacePnl } from "@/lib/metrics";

type PnlTotals = Awaited<ReturnType<typeof buildWorkspacePnl>>["totals"];

export function BusinessPnlPanel({
  totals,
  currency,
  fixedMonthly,
  storeCount,
}: {
  totals: PnlTotals;
  currency: string;
  fixedMonthly: number;
  storeCount: number;
}) {
  const money = (v: number) => formatCurrency(v, currency);
  const sharePerStore = storeCount > 0 ? fixedMonthly / storeCount : 0;
  const ebitda = totals.netProfit - fixedMonthly;
  const margin = totals.revenue > 0 ? (ebitda / totals.revenue) * 100 : 0;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div>
        <h2 className="text-lg font-semibold">Modo empresarial</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Lucro operacional menos fixos mensais do workspace (despesas sem loja).
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <dt className="text-xs font-medium text-muted-foreground">
            Lucro operacional (período)
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums" data-sensitive>
            {money(totals.netProfit)}
          </dd>
        </div>
        <div className="rounded-lg border border-border p-4">
          <dt className="text-xs font-medium text-muted-foreground">
            Fixos mensais (workspace)
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-negative" data-sensitive>
            −{money(fixedMonthly)}
          </dd>
        </div>
        <div className="rounded-lg border border-border p-4">
          <dt className="text-xs font-medium text-muted-foreground">
            Resultado após fixos
          </dt>
          <dd
            className={`mt-1 text-xl font-semibold tabular-nums ${ebitda >= 0 ? "text-positive" : "text-negative"}`}
            data-sensitive
          >
            {money(ebitda)}
          </dd>
          <p className="mt-1 text-xs text-muted-foreground">
            Margem {formatPercent(margin)}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <dt className="text-xs font-medium text-muted-foreground">
            Quota fixos por loja (igual)
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums" data-sensitive>
            {money(sharePerStore)}
          </dd>
          <p className="mt-1 text-xs text-muted-foreground">
            {storeCount} loja{storeCount === 1 ? "" : "s"}
          </p>
        </div>
      </dl>
    </div>
  );
}
