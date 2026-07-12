"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2 } from "lucide-react";
import { EU_CUSTOMS_FEE_EFFECTIVE_FROM } from "@/lib/eu-category-fees-types";
import {
  backfillOrderShippingCountriesAction,
  type StoreDataState,
} from "@/app/(app)/definicoes/store-data-actions";

export function ShippingCountriesBackfillPanel({
  storeId,
  missingCountryOrders,
}: {
  storeId: string;
  missingCountryOrders: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<StoreDataState, FormData>(
    backfillOrderShippingCountriesAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (missingCountryOrders <= 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-start gap-2">
        <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Países de envio em falta</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Faltam países em {missingCountryOrders} encomenda
            {missingCountryOrders === 1 ? "" : "s"} (desde{" "}
            {EU_CUSTOMS_FEE_EFFECTIVE_FROM}). Sem país não contamos a taxa UE
            nessas vendas. O sync normal preenche automaticamente em lotes — usa
            este botão só se quiseres forçar já, sem esperar pelo próximo sync.
          </p>
        </div>
      </div>

      <form action={action} className="mt-4">
        <input type="hidden" name="storeId" value={storeId} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted/50 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
          Atualizar países de envio
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          Só busca o país na Shopify — não reimporta encomendas nem altera COGS,
          taxas nem custos já guardados.
        </p>
        {state.error && (
          <p className="mt-2 text-sm text-negative">{state.error}</p>
        )}
        {state.message && (
          <p className="mt-2 text-sm text-positive">{state.message}</p>
        )}
      </form>
    </div>
  );
}
