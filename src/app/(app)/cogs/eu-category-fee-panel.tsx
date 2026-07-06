"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import type { EuCategoryFeeRow } from "@/lib/eu-category-fees";
import { saveEuCategoryFeeDayAction, type ManualCogsState } from "./actions";
import { CogsCurrencySelect } from "./cogs-currency-select";
import { Sensitive } from "@/components/privacy-mode";
import { DecimalInput } from "@/components/decimal-input";

const inputCls =
  "w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus:border-accent";

function fmt(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

function EuCategoryFeeRowForm({
  row,
  storeId,
  defaultCurrency,
}: {
  row: EuCategoryFeeRow;
  storeId: string;
  defaultCurrency: string;
}) {
  const [saveState, doSave, saving] = useActionState<ManualCogsState, FormData>(
    saveEuCategoryFeeDayAction,
    {},
  );

  const missing = row.amount === null;
  const defaults =
    row.inputAmount != null && row.inputCurrency
      ? { amount: String(row.inputAmount), currency: row.inputCurrency }
      : row.amount != null
        ? { amount: String(row.amount), currency: row.baseCurrency }
        : { amount: "", currency: defaultCurrency };

  if (!row.hasOrders) {
    return (
      <tr className="border-t border-border align-middle text-muted-foreground">
        <td className="px-4 py-3 tabular-nums">{row.label}</td>
        <td className="px-4 py-3 text-right">—</td>
        <td className="px-4 py-3 text-right">—</td>
        <td className="px-4 py-3 text-xs">Sem vendas</td>
      </tr>
    );
  }

  return (
    <tr
      className={`border-t border-border align-middle ${missing ? "bg-warning/5" : ""}`}
    >
      <td className="px-4 py-3">
        <p className="font-medium tabular-nums">{row.label}</p>
        {row.isYesterday && (
          <span className="text-xs text-muted-foreground">Ontem</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {row.amount != null ? (
          <Sensitive>{fmt(row.amount, row.baseCurrency)}</Sensitive>
        ) : (
          <span className="text-warning">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
        {row.inputCurrency &&
        row.inputCurrency !== row.baseCurrency &&
        row.inputAmount != null ? (
          <Sensitive>
            {row.inputAmount} {row.inputCurrency}
            {row.fxRate != null ? ` · ${row.fxRate.toFixed(4)}` : ""}
          </Sensitive>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3">
        <form action={doSave} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="date" value={row.dateKey} />
          <DecimalInput
            name="amount"
            placeholder="0"
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
        <p className="mt-1 text-xs text-muted-foreground">
          Usa 0 se não houve taxa ou já está no custo do produto.
        </p>
      </td>
    </tr>
  );
}

export function EuCategoryFeePanel({
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
  rows: EuCategoryFeeRow[];
}) {
  const missingCount = rows.filter((r) => r.hasOrders && r.amount === null).length;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">Taxas EU por categoria</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Total diário da taxa Shopify de 3 € por categoria por encomenda em{" "}
          <Sensitive as="span">{storeName}</Sensitive>. Só aplica desde{" "}
          <span className="tabular-nums">29/06/2026</span> — dias anteriores não
          aparecem. Soma ao COGS do dia para a margem e % de COGS ficarem
          correctas. Converte para {baseCurrency} na dashboard.
        </p>
        {missingCount > 0 && (
          <p className="mt-2 text-sm text-warning">
            {missingCount} dia{missingCount === 1 ? "" : "s"} com vendas sem taxa
            registada.
          </p>
        )}
      </div>
      <div className="max-h-[520px] overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-3">Dia</th>
              <th className="px-4 py-3 text-right">Taxa ({baseCurrency})</th>
              <th className="px-4 py-3 text-right">Entrada</th>
              <th className="px-4 py-3">Registar</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <EuCategoryFeeRowForm
                key={r.dateKey}
                row={r}
                storeId={storeId}
                defaultCurrency={inputCurrency}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
