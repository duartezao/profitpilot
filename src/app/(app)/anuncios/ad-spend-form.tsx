"use client";

import { useActionState } from "react";
import { saveManualAdSpendAction, type AdSpendState } from "./actions";
import { Sensitive } from "@/components/privacy-mode";
import { AdSpendCurrencySelect } from "./ad-spend-currency-select";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const labelCls = "mb-1 block text-sm font-medium";

export function AdSpendForm({
  storeId,
  storeName,
  baseCurrency,
  defaultDate,
  defaultAmount,
  defaultCurrency = "USD",
  minDate,
  canEdit,
}: {
  storeId: string;
  storeName: string;
  baseCurrency: string;
  defaultDate: string;
  defaultAmount?: string;
  defaultCurrency?: string;
  minDate?: string;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<AdSpendState, FormData>(
    saveManualAdSpendAction,
    {},
  );

  return (
    <form
      action={action}
      className="space-y-4 rounded-lg border border-border bg-surface p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">Registar ad spend</h2>
        <p className="text-sm text-muted-foreground">
          Introduz o gasto em ads em <Sensitive as="span">{storeName}</Sensitive>. Se estiver em USD (ou outra
          moeda), converte automaticamente para {baseCurrency} com a taxa do dia.
        </p>
      </div>

      {state.error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
          Ad spend guardado.
        </p>
      )}

      <input type="hidden" name="storeId" value={storeId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Data</label>
          <input
            name="date"
            type="date"
            defaultValue={defaultDate}
            min={minDate}
            disabled={!canEdit}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Gasto em ads</label>
          <div className="flex gap-2">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultAmount ?? ""}
              disabled={!canEdit}
              placeholder="0,00"
              className={`${inputCls} tabular-nums`}
              required
              data-sensitive
            />
            <AdSpendCurrencySelect
              defaultValue={defaultCurrency}
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>

      <div>
        <label className={labelCls}>Fee extra (opcional)</label>
        <input
          name="extraFee"
          type="number"
          step="0.01"
          min="0"
          disabled={!canEdit}
          placeholder="0,00"
          className={`${inputCls} tabular-nums`}
          data-sensitive
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Na mesma moeda do gasto (ex.: comissão agência). Converte para{" "}
          {baseCurrency} e soma ao total do dia.
        </p>
      </div>

      <div>
        <label className={labelCls}>Nota (opcional)</label>
        <input
          name="note"
          type="text"
          disabled={!canEdit}
          placeholder="Ex.: Meta + TikTok"
          className={inputCls}
        />
      </div>

      {canEdit && (
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "A guardar…" : "Guardar"}
        </button>
      )}
    </form>
  );
}
