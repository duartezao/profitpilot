"use client";

import { useActionState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import {
  deleteAdAccountAction,
  type AdAccountActionState,
} from "@/app/(app)/anuncios/ad-account-actions";

export function DeleteAdAccountButton({
  accountId,
  label = "Desligar esta conta API? O histórico de campanhas e gastos fica guardado na BD para finanças e relatórios.",
  onDeleted,
}: {
  accountId: string;
  label?: string;
  onDeleted?: () => void;
}) {
  const [state, action, pending] = useActionState<AdAccountActionState, FormData>(
    deleteAdAccountAction,
    {},
  );

  useEffect(() => {
    if (state.ok) onDeleted?.();
  }, [state.ok, onDeleted]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(label)) e.preventDefault();
      }}
    >
      <input type="hidden" name="accountId" value={accountId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-negative disabled:opacity-50"
        title="Desligar conta"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {pending ? "A remover…" : "Desligar"}
      </button>
      {state.error && (
        <p className="mt-1 text-xs text-negative">{state.error}</p>
      )}
    </form>
  );
}
