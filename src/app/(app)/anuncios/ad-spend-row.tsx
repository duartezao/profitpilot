"use client";

import { useActionState } from "react";
import { Check, Trash2 } from "lucide-react";
import type { AdSpendDayRow } from "@/lib/ad-spend";
import {
  saveManualAdSpendAction,
  deleteManualAdSpendAction,
  type AdSpendState,
} from "./actions";
import { AdSpendCurrencySelect } from "./ad-spend-currency-select";
import { Sensitive } from "@/components/privacy-mode";

const inputCls =
  "w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus:border-accent";

function fmt(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
    }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

function editDefaults(row: AdSpendDayRow) {
  if (row.inputAmount != null && row.inputCurrency) {
    return {
      amount: String(row.inputAmount),
      extraFee:
        row.inputExtraFee != null && row.inputExtraFee > 0
          ? String(row.inputExtraFee)
          : "",
      currency: row.inputCurrency,
    };
  }
  if (row.amount != null) {
    return {
      amount: String(row.amount),
      extraFee:
        row.extraFee != null && row.extraFee > 0 ? String(row.extraFee) : "",
      currency: row.baseCurrency,
    };
  }
  return { amount: "", extraFee: "", currency: "USD" };
}

export function AdSpendRow({
  row,
  storeId,
  canEdit,
}: {
  row: AdSpendDayRow;
  storeId: string;
  canEdit: boolean;
}) {
  const [saveState, doSave, saving] = useActionState<AdSpendState, FormData>(
    saveManualAdSpendAction,
    {},
  );
  const [, doDelete, deleting] = useActionState<AdSpendState, FormData>(
    deleteManualAdSpendAction,
    {},
  );

  const missing = row.amount === null;
  const defaults = editDefaults(row);
  const showConversion =
    !missing &&
    row.inputCurrency &&
    row.inputCurrency !== row.baseCurrency &&
    row.inputAmount != null;
  const hasExtra = (row.extraFee ?? 0) > 0;

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
      <td className="px-4 py-3">
        {missing ? (
          <span className="text-xs font-medium text-warning">Em falta</span>
        ) : (
          <span className="text-xs text-muted-foreground">Fechado</span>
        )}
        {row.hasOrders && (
          <span className="ml-2 text-xs text-muted-foreground">· com vendas</span>
        )}
        {!missing && row.source && (
          <span className="ml-2 text-xs text-muted-foreground">
            · {row.source === "manual" ? "manual" : "API"}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {!missing && row.totalAmount != null && (
          <div data-sensitive>
            <p className="font-medium">
              {fmt(row.totalAmount, row.baseCurrency)}
            </p>
            {hasExtra && row.amount != null && (
              <p className="text-xs text-muted-foreground">
                ads {fmt(row.amount, row.baseCurrency)}
                {" + fee "}
                {fmt(row.extraFee as number, row.baseCurrency)}
              </p>
            )}
            {showConversion && (
              <p className="text-xs text-muted-foreground">
                {fmt(row.inputAmount as number, row.inputCurrency as string)}
                {row.fxRate != null && row.fxRate !== 1
                  ? ` · 1 ${row.inputCurrency} = ${row.fxRate.toFixed(4)} ${row.baseCurrency}`
                  : null}
              </p>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {canEdit ? (
          <form action={doSave} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="storeId" value={storeId} />
            <input type="hidden" name="date" value={row.dateKey} />
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaults.amount}
              placeholder="ads"
              title="Gasto em ads"
              className={inputCls}
              required
              data-sensitive
            />
            <input
              name="extraFee"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaults.extraFee}
              placeholder="fee"
              title="Fee extra (opcional)"
              className={`${inputCls} w-16`}
              data-sensitive
            />
            <AdSpendCurrencySelect defaultValue={defaults.currency} />
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "…" : missing ? "Preencher" : "Guardar"}
            </button>
            {saveState.ok && <Check className="h-4 w-4 text-positive" />}
            {saveState.error && (
              <span className="text-xs text-negative">{saveState.error}</span>
            )}
          </form>
        ) : missing ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : null}
      </td>
      <td className="px-4 py-3">
        {canEdit && !missing && (
          <form action={doDelete}>
            <input type="hidden" name="storeId" value={storeId} />
            <input type="hidden" name="date" value={row.dateKey} />
            <button
              type="submit"
              disabled={deleting}
              aria-label="Apagar registo"
              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-negative disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
