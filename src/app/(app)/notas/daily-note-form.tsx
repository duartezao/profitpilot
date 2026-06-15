"use client";

import { useActionState } from "react";
import { saveDailyNoteAction, type NoteState } from "./actions";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const labelCls = "mb-1 block text-sm font-medium";

export type StoreOption = { id: string; name: string };

export function DailyNoteForm({
  stores,
  defaultDate,
  defaultStoreId,
  canEdit,
}: {
  stores: StoreOption[];
  defaultDate: string;
  defaultStoreId?: string | null;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<NoteState, FormData>(
    saveDailyNoteAction,
    {},
  );

  return (
    <form action={action} className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">Nota do dia</h2>
      {state.error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
          Nota guardada.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Data</label>
          <input
            name="date"
            type="date"
            defaultValue={defaultDate}
            disabled={!canEdit}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Loja</label>
          <select
            name="storeId"
            disabled={!canEdit}
            className={inputCls}
            defaultValue={defaultStoreId ?? ""}
            data-sensitive
          >
            <option value="">Todas / workspace</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          name="didScale"
          type="checkbox"
          disabled={!canEdit}
          className="h-4 w-4 rounded border-border"
        />
        Dei scale hoje
      </label>

      <div>
        <label className={labelCls}>Humor do dia</label>
        <select name="mood" disabled={!canEdit} className={inputCls}>
          <option value="">—</option>
          <option value="good">Bom</option>
          <option value="neutral">Normal</option>
          <option value="bad">Mau</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Observações</label>
        <textarea
          name="text"
          rows={4}
          disabled={!canEdit}
          placeholder="Mudanças, testes, o que funcionou ou não… (aparece em OBS no relatório diário)"
          className={inputCls}
          data-sensitive
        />
      </div>

      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">
          Campos do relatório diário
        </legend>
        <p className="text-xs text-muted-foreground">
          Preenchidos no template automático em Métricas e Notas (produtos, coleções, dificuldades).
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Produtos testados</label>
            <input
              name="productsTested"
              type="text"
              disabled={!canEdit}
              className={inputCls}
              data-sensitive
            />
          </div>
          <div>
            <label className={labelCls}>Coleções testadas</label>
            <input
              name="collectionsTested"
              type="text"
              disabled={!canEdit}
              className={inputCls}
              data-sensitive
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Quais coleções já testadas</label>
            <input
              name="collectionsTestedList"
              type="text"
              disabled={!canEdit}
              className={inputCls}
              data-sensitive
            />
          </div>
          <div>
            <label className={labelCls}>Próxima coleção a testar</label>
            <input
              name="nextCollection"
              type="text"
              disabled={!canEdit}
              className={inputCls}
              data-sensitive
            />
          </div>
          <div>
            <label className={labelCls}>Coleção best-seller</label>
            <input
              name="bestSellerCollection"
              type="text"
              disabled={!canEdit}
              className={inputCls}
              data-sensitive
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Principais dificuldades</label>
            <input
              name="difficulties"
              type="text"
              disabled={!canEdit}
              className={inputCls}
              data-sensitive
            />
          </div>
        </div>
      </fieldset>

      {canEdit && (
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "A guardar…" : "Guardar nota"}
        </button>
      )}
    </form>
  );
}
