"use client";

import { useActionState } from "react";
import { updateWorkspaceAction, type SettingsState } from "./actions";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-medium";

export type WorkspaceValues = {
  name: string;
  baseCurrency: string;
  taxReservePercent: number;
  netMarginMin: number;
  refundRateMax: number;
  chargebackRateMax: number;
};

export function WorkspaceForm({
  values,
  canEdit,
}: {
  values: WorkspaceValues;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateWorkspaceAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
          Definições guardadas.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Nome do workspace</label>
          <input name="name" defaultValue={values.name} disabled={!canEdit} className={inputCls} data-sensitive />
        </div>
        <div>
          <label className={labelCls}>Moeda base</label>
          <input
            name="baseCurrency"
            defaultValue={values.baseCurrency}
            maxLength={3}
            disabled={!canEdit}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Reserva para impostos (%)</label>
          <input
            name="taxReservePercent"
            type="number"
            step="0.1"
            defaultValue={values.taxReservePercent}
            disabled={!canEdit}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Política global aplicada à tesouraria de cada loja. O saldo inicial é
            definido por loja.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Metas / alertas</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Margem mín. (%)</label>
            <input
              name="netMarginMin"
              type="number"
              step="0.1"
              defaultValue={values.netMarginMin}
              disabled={!canEdit}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Refund rate máx. (%)</label>
            <input
              name="refundRateMax"
              type="number"
              step="0.1"
              defaultValue={values.refundRateMax}
              disabled={!canEdit}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Chargeback máx. (%)</label>
            <input
              name="chargebackRateMax"
              type="number"
              step="0.1"
              defaultValue={values.chargebackRateMax}
              disabled={!canEdit}
              className={inputCls}
            />
          </div>
        </div>
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
