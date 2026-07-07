"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import type { ExpenseRow } from "@/lib/expenses";
import {
  addExpenseAction,
  deleteExpenseAction,
  type ExpenseActionState,
} from "@/app/(app)/financas/expense-actions";
import { Sensitive } from "@/components/privacy-mode";
import { DecimalInput } from "@/components/decimal-input";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_FREQUENCIES,
  expenseCategoryLabel,
  expenseFrequencyLabel,
} from "@/lib/expense-constants";
import { CollapsibleSection } from "@/components/collapsible-section";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-medium";

type StoreOption = { id: string; name: string };

export function ExpensesPanel({
  expenses,
  stores,
  canEdit,
  baseCurrency,
}: {
  expenses: ExpenseRow[];
  stores: StoreOption[];
  canEdit: boolean;
  baseCurrency: string;
}) {
  const [addState, addAction, adding] = useActionState<
    ExpenseActionState,
    FormData
  >(addExpenseAction, {});

  const today = new Date().toISOString().slice(0, 10);

  return (
    <CollapsibleSection
      id="despesas-fixos"
      title="Apps, subscrições e fixos"
      description="Custos fora de COGS e ads — pontual só no dia; mensal/anual na data de cobrança."
      badge={
        expenses.length > 0 ? (
          <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {expenses.length}
          </span>
        ) : undefined
      }
    >
        {canEdit && (
          <form action={addAction} className="space-y-4 rounded-lg border border-border bg-background p-4">
            <p className="text-sm font-medium">Nova despesa</p>

            {addState.error && (
              <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
                {addState.error}
              </p>
            )}
            {addState.ok && (
              <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
                Despesa registada.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="expense-name">
                  Nome
                </label>
                <input
                  id="expense-name"
                  name="name"
                  required
                  maxLength={120}
                  placeholder="Ex.: ChatGPT Plus"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="expense-category">
                  Categoria
                </label>
                <select
                  id="expense-category"
                  name="category"
                  className={inputCls}
                  defaultValue="ia"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {expenseCategoryLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="expense-store">
                  Âmbito
                </label>
                <select id="expense-store" name="storeId" className={inputCls} defaultValue="">
                  <option value="">Todas as lojas (workspace)</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="expense-amount">
                  Valor
                </label>
                <DecimalInput
                  id="expense-amount"
                  name="amount"
                  required
                  min={0}
                  step="0.01"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="expense-currency">
                  Moeda
                </label>
                <select
                  id="expense-currency"
                  name="currency"
                  className={inputCls}
                  defaultValue={baseCurrency === "USD" ? "USD" : "EUR"}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="expense-frequency">
                  Frequência
                </label>
                <select
                  id="expense-frequency"
                  name="frequency"
                  className={inputCls}
                  defaultValue="monthly"
                >
                  {EXPENSE_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {expenseFrequencyLabel(f)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="expense-start">
                  Desde
                </label>
                <input
                  id="expense-start"
                  name="startDateKey"
                  type="date"
                  required
                  defaultValue={today}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="expense-end">
                  Até (opcional)
                </label>
                <input
                  id="expense-end"
                  name="endDateKey"
                  type="date"
                  className={inputCls}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={adding}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
            >
              {adding ? "A guardar…" : "Adicionar despesa"}
            </button>
          </form>
        )}

        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há despesas registadas. O lucro só inclui COGS, envio, taxas
            e ads até adicionares apps ou subscrições aqui.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted-foreground">
                    <th className="pb-2 pr-3">Nome</th>
                    <th className="pb-2 pr-3">Categoria</th>
                    <th className="pb-2 pr-3">Âmbito</th>
                    <th className="pb-2 pr-3 text-right">Valor</th>
                    <th className="pb-2 pr-3">Frequência</th>
                    <th className="pb-2 pr-3">Vigência</th>
                    {canEdit && <th className="pb-2" />}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="py-3 pr-3 font-medium">
                        <Sensitive>{e.name}</Sensitive>
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        {e.categoryLabel}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        <Sensitive>{e.storeName ?? "Workspace"}</Sensitive>
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums">
                        <Sensitive>{e.amountBaseFmt}</Sensitive>
                        <span className="block text-xs text-muted-foreground">
                          {e.amountFmt}
                        </span>
                      </td>
                      <td className="py-3 pr-3">{e.frequencyLabel}</td>
                      <td className="py-3 pr-3 text-xs text-muted-foreground">
                        {e.startDateKey.split("-").reverse().join("/")}
                        {e.endDateKey
                          ? ` – ${e.endDateKey.split("-").reverse().join("/")}`
                          : " – …"}
                      </td>
                      {canEdit && (
                        <td className="py-3 text-right">
                          <DeleteExpenseButton expenseId={e.id} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 lg:hidden">
              {expenses.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Sensitive className="font-medium">{e.name}</Sensitive>
                    {canEdit && <DeleteExpenseButton expenseId={e.id} />}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.categoryLabel} ·{" "}
                    <Sensitive>{e.storeName ?? "Workspace"}</Sensitive>
                  </p>
                  <p className="mt-2 text-sm tabular-nums">
                    <Sensitive>{e.amountBaseFmt}</Sensitive>
                    <span className="text-muted-foreground">
                      {" "}
                      / {e.frequencyLabel.toLowerCase()}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
    </CollapsibleSection>
  );
}

function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  const [, action, pending] = useActionState<ExpenseActionState, FormData>(
    deleteExpenseAction,
    {},
  );

  return (
    <form action={action}>
      <input type="hidden" name="expenseId" value={expenseId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-negative disabled:opacity-50"
        title="Remover despesa"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  );
}
