"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import type { CashEntryRow } from "@/lib/cash-entries";
import {
  addCashEntryAction,
  deleteCashEntryAction,
  type CashActionState,
} from "./cash-actions";
import { Sensitive } from "@/components/privacy-mode";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-medium";

type StoreOption = { id: string; name: string; currency: string };

export function CashInjectionPanel({
  stores,
  entries,
  canEdit,
  embedded = false,
}: {
  stores: StoreOption[];
  entries: (CashEntryRow & { storeName: string })[];
  canEdit: boolean;
  /** Sem cabeçalho de secção — usado dentro de painel colapsável. */
  embedded?: boolean;
}) {
  const [addState, addAction, adding] = useActionState<
    CashActionState,
    FormData
  >(addCashEntryAction, {});

  if (stores.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const defaultStore = stores[0]!;

  const Wrapper = embedded ? "div" : "section";
  const wrapperProps = embedded ? {} : { id: "capital-negocio" as const };

  return (
    <Wrapper {...wrapperProps} className="space-y-4">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold">Capital no negócio</h2>
          <p className="text-sm text-muted-foreground">
            Regista quando depositas ou levantas dinheiro da conta do negócio —
            separado do saldo inicial para não alterares a caixa por engano.
          </p>
        </div>
      )}

      {canEdit && (
        <form
          action={addAction}
          className="space-y-4 rounded-lg border border-border bg-surface p-5"
        >
          <div>
            <p className="text-sm font-medium">Novo movimento</p>
            <p className="text-xs text-muted-foreground">
              Ex.: chegaste a €0 e no dia 12 depositaste mais €500 na conta do
              negócio.
            </p>
          </div>

          {addState.error && (
            <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {addState.error}
            </p>
          )}
          {addState.ok && (
            <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
              Movimento registado. A tesouraria actualiza automaticamente.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Loja</label>
              <select
                name="storeId"
                defaultValue={defaultStore.id}
                className={inputCls}
                data-sensitive
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tipo</label>
              <select name="type" defaultValue="manual_in" className={inputCls}>
                <option value="manual_in">Injeção — entrei dinheiro</option>
                <option value="manual_out">Levantamento — saiu da conta</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Data do movimento</label>
              <input
                name="dueDateKey"
                type="date"
                max={today}
                defaultValue={today}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Valor</label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                className={`${inputCls} tabular-nums`}
                required
                data-sensitive
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Motivo</label>
              <input
                name="description"
                type="text"
                placeholder="Ex.: Reforço de caixa via transferência MB"
                className={inputCls}
                required
                maxLength={500}
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              name="confirm"
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span>
              Confirmo que este valor entrou ou saiu da conta do negócio nesta
              data (não é lucro nem payout da Shopify).
            </span>
          </label>

          <button
            type="submit"
            disabled={adding}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {adding ? "A registar…" : "Registar movimento"}
          </button>
        </form>
      )}

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-5">
          <h3 className="text-sm font-semibold">Histórico</h3>
          <p className="text-xs text-muted-foreground">
            Injeções e levantamentos registados neste workspace.
          </p>
        </div>
        {entries.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Ainda não há movimentos de capital.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <Sensitive as="span">{e.storeName}</Sensitive>
                    <span className="text-muted-foreground">
                      {" "}
                      · {e.dueDateLabel}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{e.typeLabel}</p>
                  {e.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground" data-sensitive>
                      {e.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      e.type === "manual_in" ? "text-positive" : "text-negative"
                    }`}
                    data-sensitive
                  >
                    {e.signedFmt}
                  </span>
                  {canEdit && (
                    <DeleteEntryButton entryId={e.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Wrapper>
  );
}

function DeleteEntryButton({ entryId }: { entryId: string }) {
  const [state, action, pending] = useActionState<CashActionState, FormData>(
    deleteCashEntryAction,
    {},
  );

  return (
    <form action={action}>
      <input type="hidden" name="entryId" value={entryId} />
      <button
        type="submit"
        disabled={pending}
        aria-label="Remover movimento"
        title={state.error ?? "Remover"}
        className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-negative disabled:opacity-60"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  );
}
