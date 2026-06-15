"use client";

import { useActionState, useEffect } from "react";
import { saveManualAdSpendAction, type AdSpendState } from "./actions";
import { Sensitive } from "@/components/privacy-mode";
import {
  AdSpendPlatformFields,
  type PlatformDefaults,
} from "./ad-spend-platform-fields";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const labelCls = "mb-1 block text-sm font-medium";

export function AdSpendForm({
  storeId,
  storeName,
  baseCurrency,
  defaultDate,
  platformDefaults,
  defaultCurrency = "USD",
  minDate,
  canEdit,
  onSaved,
  embedded = false,
}: {
  storeId: string;
  storeName: string;
  baseCurrency: string;
  defaultDate: string;
  platformDefaults?: PlatformDefaults;
  defaultCurrency?: string;
  minDate?: string;
  canEdit: boolean;
  onSaved?: () => void;
  /** Dentro de CollapsibleSection — sem cabeçalho duplicado. */
  embedded?: boolean;
}) {
  const [state, action, pending] = useActionState<AdSpendState, FormData>(
    saveManualAdSpendAction,
    {},
  );

  useEffect(() => {
    if (state.ok || state.conflict) {
      onSaved?.();
    }
  }, [state.ok, state.conflict, onSaved]);

  return (
    <form
      action={action}
      className={
        embedded
          ? "space-y-4"
          : "space-y-4 rounded-lg border border-border bg-surface p-5"
      }
    >
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold">Registar ad spend</h2>
          <p className="text-sm text-muted-foreground">
            Por plataforma em <Sensitive as="span">{storeName}</Sensitive> — gasto,
            fee fixa de agência e % sobre o gasto. Converte para {baseCurrency}{" "}
            com a taxa do dia.
          </p>
        </div>
      )}

      {state.error && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            state.conflict
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-negative/30 bg-negative/10 text-negative"
          }`}
        >
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
          Ad spend guardado.
        </p>
      )}

      <input type="hidden" name="storeId" value={storeId} />

      <div className="max-w-xs">
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

      <AdSpendPlatformFields
        defaults={platformDefaults}
        inputCurrency={defaultCurrency}
        disabled={!canEdit}
      />

      <div>
        <label className={labelCls}>Nota (opcional)</label>
        <input
          name="note"
          type="text"
          disabled={!canEdit}
          placeholder="Ex.: campanha Black Friday"
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
