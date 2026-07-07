"use client";

import { useActionState, useEffect, useState } from "react";
import { saveManualAdSpendAction, type AdSpendState } from "./actions";
import { Sensitive } from "@/components/privacy-mode";
import {
  AdSpendPlatformFields,
  type PlatformDefaults,
} from "./ad-spend-platform-fields";
import type { AdPlatform } from "@/lib/ad-spend-platforms";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const labelCls = "mb-1 block text-sm font-medium";

export function AdSpendForm({
  storeId,
  storeName,
  baseCurrency,
  defaultDate,
  todayKey,
  apiLinkedPlatforms = [],
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
  todayKey: string;
  apiLinkedPlatforms?: AdPlatform[];
  platformDefaults?: PlatformDefaults;
  defaultCurrency?: string;
  minDate?: string;
  canEdit: boolean;
  onSaved?: () => void;
  /** Dentro de CollapsibleSection — sem cabeçalho duplicado. */
  embedded?: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [state, action, pending] = useActionState<AdSpendState, FormData>(
    saveManualAdSpendAction,
    {},
  );

  const isToday = selectedDate === todayKey;

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
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          min={minDate}
          disabled={!canEdit}
          className={inputCls}
          required
        />
      </div>

      {isToday && apiLinkedPlatforms.length > 0 && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Hoje ({todayKey}): plataformas com conta API sincronizam sozinhas —
          inclui fees no custo dos ads. Preenche só o que for manual.
        </p>
      )}

      <AdSpendPlatformFields
        defaults={platformDefaults}
        inputCurrency={defaultCurrency}
        disabled={!canEdit}
        showZeroOption={canEdit}
        apiLinkedPlatforms={apiLinkedPlatforms}
        lockedDate={isToday}
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
