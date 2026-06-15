"use client";

import { useActionState } from "react";
import { removeStoreBankrollAction, type SettingsState } from "./actions";

export function RemoveBankrollForm({ storeId }: { storeId: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    removeStoreBankrollAction,
    {},
  );

  return (
    <form
      action={action}
      className="mt-4 space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-4"
    >
      <input type="hidden" name="storeId" value={storeId} />
      <p className="text-sm font-medium">Retirar banca</p>
      <p className="text-xs text-muted-foreground">
        Remove o saldo inicial desta loja. A tesouraria e finanças deixam de
        contar esse valor (o histórico de vendas mantém-se).
      </p>
      {state.error && <p className="text-xs text-negative">{state.error}</p>}
      {state.ok && <p className="text-xs text-positive">Banca removida.</p>}
      <label className="flex items-start gap-2 text-sm">
        <input
          name="confirm"
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border"
        />
        Confirmo que quero remover a banca desta loja
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {pending ? "A remover…" : "Retirar banca"}
      </button>
    </form>
  );
}
