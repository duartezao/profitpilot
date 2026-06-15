"use client";

import { useActionState, useRef } from "react";
import { Upload } from "lucide-react";
import {
  importCogsCsvAction,
  type CogsImportState,
} from "@/app/(app)/cogs/actions";

export function CogsCsvImport({
  stores,
  defaultStoreId,
}: {
  stores: { id: string; name: string }[];
  defaultStoreId?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<CogsImportState, FormData>(
    importCogsCsvAction,
    {},
  );

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10">
          <Upload className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Importar COGS (CSV)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Colunas: <code className="text-foreground">variant_id</code>,{" "}
            <code className="text-foreground">cost</code> (opcional: title).
            Separador vírgula ou ponto-e-vírgula.
          </p>

          <form ref={formRef} action={action} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Loja
              </label>
              <select
                name="storeId"
                defaultValue={defaultStoreId ?? stores[0]?.id ?? ""}
                required
                data-sensitive
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Ficheiro CSV
              </label>
              <input
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
              />
            </div>

            <button
              type="submit"
              disabled={pending || stores.length === 0}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
            >
              {pending ? "A importar…" : "Importar custos"}
            </button>
          </form>

          {state.error && (
            <p className="mt-3 text-sm text-negative">{state.error}</p>
          )}
          {state.ok && (
            <p className="mt-3 text-sm text-positive">
              {state.imported} variante(s) actualizada(s).
              {state.skipped ? ` ${state.skipped} ignorada(s).` : ""}
            </p>
          )}
          {state.warnings && state.warnings.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
              {state.warnings.slice(0, 5).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
