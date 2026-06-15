"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import type { OrderCogsRow } from "@/lib/manual-cogs";
import {
  saveManualOrderCogsAction,
  clearManualOrderCogsAction,
  type ManualCogsState,
} from "./actions";
import { CogsCurrencySelect } from "./cogs-currency-select";
import { Sensitive } from "@/components/privacy-mode";

const inputCls =
  "w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus:border-accent";

function fmt(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

function OrderCogsRowForm({
  row,
  storeId,
  defaultCurrency,
}: {
  row: OrderCogsRow;
  storeId: string;
  defaultCurrency: string;
}) {
  const [saveState, doSave, saving] = useActionState<ManualCogsState, FormData>(
    saveManualOrderCogsAction,
    {},
  );
  const [, doClear, clearing] = useActionState<ManualCogsState, FormData>(
    clearManualOrderCogsAction,
    {},
  );

  const defaults = row.inputAmount != null
    ? { amount: String(row.inputAmount), currency: row.inputCurrency ?? defaultCurrency }
    : { amount: "", currency: defaultCurrency };

  return (
    <tr
      className={`border-t border-border align-middle ${row.missing ? "bg-warning/5" : ""}`}
    >
      <td className="px-4 py-3">
        <Sensitive className="font-medium tabular-nums">{row.name}</Sensitive>
        <span className="block text-xs text-muted-foreground">{row.dateLabel}</span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        <Sensitive>{fmt(row.netRevenue, row.baseCurrency)}</Sensitive>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {row.manualCogs != null ? (
          <Sensitive>{fmt(row.manualCogs, row.baseCurrency)}</Sensitive>
        ) : (
          <span className="text-warning">—</span>
        )}
        {row.inputCurrency && row.inputCurrency !== row.baseCurrency && row.fxRate != null && (
          <span className="block text-xs text-muted-foreground">
            {row.inputAmount} {row.inputCurrency}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <form action={doSave} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="orderId" value={row.orderId} />
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="COGS"
            defaultValue={defaults.amount}
            className={inputCls}
            data-sensitive
          />
          <CogsCurrencySelect defaultValue={defaults.currency} />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "…" : "Guardar"}
          </button>
          {saveState.ok && <Check className="h-4 w-4 text-positive" />}
          {saveState.error && (
            <span className="text-xs text-negative">{saveState.error}</span>
          )}
        </form>
        {!row.missing && (
          <form action={doClear} className="mt-1">
            <input type="hidden" name="storeId" value={storeId} />
            <input type="hidden" name="orderId" value={row.orderId} />
            <button
              type="submit"
              disabled={clearing}
              className="text-xs text-muted-foreground hover:text-negative disabled:opacity-60"
            >
              {clearing ? "…" : "Limpar"}
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}

export function OrderCogsPanel({
  storeId,
  storeName,
  baseCurrency,
  inputCurrency,
  rows,
}: {
  storeId: string;
  storeName: string;
  baseCurrency: string;
  inputCurrency: string;
  rows: OrderCogsRow[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">COGS por encomenda</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Introduz o custo total de cada encomenda em{" "}
          <Sensitive as="span">{storeName}</Sensitive>. Valores em USD convertem
          para {baseCurrency}. A dashboard mostra tudo em {baseCurrency}.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-3">Encomenda</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-right">COGS</th>
              <th className="px-4 py-3">Registar</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Sincroniza a loja para ver encomendas.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <OrderCogsRowForm
                  key={r.orderId}
                  row={r}
                  storeId={storeId}
                  defaultCurrency={inputCurrency}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
