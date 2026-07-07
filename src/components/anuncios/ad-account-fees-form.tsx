"use client";

import { useActionState, useEffect } from "react";
import {
  updateAdAccountFeesAction,
  type AdAccountActionState,
} from "@/app/(app)/anuncios/ad-account-actions";
import type { AdAccountRow } from "@/lib/ad-accounts";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none focus:border-accent";

export function AdAccountFeesForm({
  account,
  onSaved,
}: {
  account: AdAccountRow;
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState<
    AdAccountActionState,
    FormData
  >(updateAdAccountFeesAction, {});

  useEffect(() => {
    if (state.ok) onSaved?.();
  }, [state.ok, onSaved]);

  const hasFees =
    account.apiExtraFeeFixed > 0 || account.apiAgencyFeePercent > 0;

  return (
    <form action={action} className="mt-3 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <input type="hidden" name="accountId" value={account.id} />
      <p className="text-xs font-medium text-muted-foreground">
        Fees extra sobre o gasto API
        {hasFees ? " (activas)" : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`fee-fixed-${account.id}`}
            className="mb-1 block text-xs text-muted-foreground"
          >
            Fee fixa / dia ({account.platformLabel})
          </label>
          <input
            id={`fee-fixed-${account.id}`}
            name="apiExtraFeeFixed"
            type="number"
            min={0}
            step="0.01"
            defaultValue={account.apiExtraFeeFixed}
            className={inputCls}
          />
        </div>
        <div>
          <label
            htmlFor={`fee-pct-${account.id}`}
            className="mb-1 block text-xs text-muted-foreground"
          >
            Fee agência (%)
          </label>
          <input
            id={`fee-pct-${account.id}`}
            name="apiAgencyFeePercent"
            type="number"
            min={0}
            max={100}
            step="0.1"
            defaultValue={account.apiAgencyFeePercent}
            className={inputCls}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Soma ao gasto reportado pela plataforma — entra no lucro e no ROAS das
        campanhas.
      </p>
      {state.error && (
        <p className="text-xs text-negative">{state.error}</p>
      )}
      {state.ok && (
        <p className="text-xs text-positive">Fees guardadas.</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {pending ? "A guardar…" : "Guardar fees"}
      </button>
    </form>
  );
}
