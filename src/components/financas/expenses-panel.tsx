"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import type { ExpenseRow } from "@/lib/expenses";
import {
  addExpenseAction,
  deleteExpenseAction,
  updateExpenseAction,
  type ExpenseActionState,
} from "@/app/(app)/financas/expense-actions";
import { Sensitive } from "@/components/privacy-mode";
import { DecimalInput } from "@/components/decimal-input";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_FREQUENCIES,
  expenseCategoryLabel,
  expenseFrequencyLabel,
  type ExpenseCategory,
  type ExpenseFrequency,
} from "@/lib/expense-constants";
import { CollapsibleSection } from "@/components/collapsible-section";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-medium";

type StoreOption = { id: string; name: string };

type ExpenseFormValues = {
  name: string;
  category: ExpenseCategory;
  storeId: string;
  amount: number;
  currency: string;
  frequency: ExpenseFrequency;
  startDateKey: string;
  endDateKey: string;
};

export function ExpensesPanel({
  expenses,
  stores,
  canEdit,
  baseCurrency,
  embedded = false,
}: {
  expenses: ExpenseRow[];
  stores: StoreOption[];
  canEdit: boolean;
  baseCurrency: string;
  embedded?: boolean;
}) {
  const [addState, addAction, adding] = useActionState<
    ExpenseActionState,
    FormData
  >(addExpenseAction, {});

  const today = new Date().toISOString().slice(0, 10);

  const body = (
    <>
      {canEdit && (
        <form
          action={addAction}
          className="space-y-4 rounded-lg border border-border bg-background p-4"
        >
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

          <ExpenseFormFields
            idPrefix="add"
            stores={stores}
            baseCurrency={baseCurrency}
            defaultStartDateKey={today}
          />

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
          Ainda não há despesas registadas. O lucro só inclui COGS, envio, taxas e
          ads até adicionares apps ou subscrições aqui.
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
                  <ExpenseTableRow
                    key={e.id}
                    expense={e}
                    stores={stores}
                    baseCurrency={baseCurrency}
                    canEdit={canEdit}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {expenses.map((e) => (
              <ExpenseMobileCard
                key={e.id}
                expense={e}
                stores={stores}
                baseCurrency={baseCurrency}
                canEdit={canEdit}
              />
            ))}
          </div>
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Apps, subscrições e fixos</h2>
          <p className="text-sm text-muted-foreground">
            Custos fora de COGS e ads — pontual só no dia; mensal/anual na data de
            cobrança.
          </p>
        </div>
        {body}
      </div>
    );
  }

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
      {body}
    </CollapsibleSection>
  );
}

function ExpenseTableRow({
  expense,
  stores,
  baseCurrency,
  canEdit,
}: {
  expense: ExpenseRow;
  stores: StoreOption[];
  baseCurrency: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <tr className="border-t border-border">
        <td className="py-3 pr-3 font-medium">
          <Sensitive>{expense.name}</Sensitive>
        </td>
        <td className="py-3 pr-3 text-muted-foreground">
          {expense.categoryLabel}
        </td>
        <td className="py-3 pr-3 text-muted-foreground">
          <Sensitive>{expense.storeName ?? "Workspace"}</Sensitive>
        </td>
        <td className="py-3 pr-3 text-right tabular-nums">
          <Sensitive>{expense.amountBaseFmt}</Sensitive>
          <span className="block text-xs text-muted-foreground">
            {expense.amountFmt}
          </span>
        </td>
        <td className="py-3 pr-3">{expense.frequencyLabel}</td>
        <td className="py-3 pr-3 text-xs text-muted-foreground">
          {formatVigencia(expense.startDateKey, expense.endDateKey)}
        </td>
        {canEdit && (
          <td className="py-3 text-right">
            <ExpenseRowActions
              expenseId={expense.id}
              editing={editing}
              onEdit={() => setEditing(true)}
              onCancelEdit={() => setEditing(false)}
            />
          </td>
        )}
      </tr>
      {editing && canEdit && (
        <tr className="border-t border-border bg-muted/30">
          <td colSpan={7} className="p-4">
            <ExpenseEditForm
              expense={expense}
              stores={stores}
              baseCurrency={baseCurrency}
              onDone={() => setEditing(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpenseMobileCard({
  expense,
  stores,
  baseCurrency,
  canEdit,
}: {
  expense: ExpenseRow;
  stores: StoreOption[];
  baseCurrency: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <Sensitive className="font-medium">{expense.name}</Sensitive>
        {canEdit && (
          <ExpenseRowActions
            expenseId={expense.id}
            editing={editing}
            onEdit={() => setEditing(true)}
            onCancelEdit={() => setEditing(false)}
          />
        )}
      </div>
      {!editing ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            {expense.categoryLabel} ·{" "}
            <Sensitive>{expense.storeName ?? "Workspace"}</Sensitive>
          </p>
          <p className="mt-2 text-sm tabular-nums">
            <Sensitive>{expense.amountBaseFmt}</Sensitive>
            <span className="text-muted-foreground">
              {" "}
              / {expense.frequencyLabel.toLowerCase()}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatVigencia(expense.startDateKey, expense.endDateKey)}
          </p>
        </>
      ) : (
        <div className="mt-3">
          <ExpenseEditForm
            expense={expense}
            stores={stores}
            baseCurrency={baseCurrency}
            onDone={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}

function ExpenseEditForm({
  expense,
  stores,
  baseCurrency,
  onDone,
}: {
  expense: ExpenseRow;
  stores: StoreOption[];
  baseCurrency: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ExpenseActionState, FormData>(
    updateExpenseAction,
    {},
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const values: ExpenseFormValues = {
    name: expense.name,
    category: expense.category,
    storeId: expense.storeId ?? "",
    amount: expense.amount,
    currency: expense.currency,
    frequency: expense.frequency,
    startDateKey: expense.startDateKey,
    endDateKey: expense.endDateKey ?? "",
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="expenseId" value={expense.id} />
      <p className="text-sm font-medium">Editar despesa</p>

      {state.error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}

      <ExpenseFormFields
        idPrefix={`edit-${expense.id}`}
        stores={stores}
        baseCurrency={baseCurrency}
        values={values}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "A guardar…" : "Guardar alterações"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ExpenseFormFields({
  idPrefix,
  stores,
  baseCurrency,
  defaultStartDateKey,
  values,
}: {
  idPrefix: string;
  stores: StoreOption[];
  baseCurrency: string;
  defaultStartDateKey?: string;
  values?: ExpenseFormValues;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={`${idPrefix}-name`}>
          Nome
        </label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          required
          maxLength={120}
          placeholder="Ex.: ChatGPT Plus"
          className={inputCls}
          defaultValue={values?.name}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-category`}>
          Categoria
        </label>
        <select
          id={`${idPrefix}-category`}
          name="category"
          className={inputCls}
          defaultValue={values?.category ?? "ia"}
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {expenseCategoryLabel(c)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-store`}>
          Âmbito
        </label>
        <select
          id={`${idPrefix}-store`}
          name="storeId"
          className={inputCls}
          defaultValue={values?.storeId ?? ""}
        >
          <option value="">Todas as lojas (workspace)</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-amount`}>
          Valor
        </label>
        <DecimalInput
          id={`${idPrefix}-amount`}
          name="amount"
          required
          min={0}
          step="0.01"
          className={inputCls}
          defaultValue={
            values != null ? String(values.amount) : undefined
          }
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-currency`}>
          Moeda
        </label>
        <select
          id={`${idPrefix}-currency`}
          name="currency"
          className={inputCls}
          defaultValue={
            values?.currency ??
            (baseCurrency === "USD" ? "USD" : "EUR")
          }
        >
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-frequency`}>
          Frequência
        </label>
        <select
          id={`${idPrefix}-frequency`}
          name="frequency"
          className={inputCls}
          defaultValue={values?.frequency ?? "monthly"}
        >
          {EXPENSE_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {expenseFrequencyLabel(f)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-start`}>
          Desde
        </label>
        <input
          id={`${idPrefix}-start`}
          name="startDateKey"
          type="date"
          required
          defaultValue={values?.startDateKey ?? defaultStartDateKey}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-end`}>
          Até (opcional)
        </label>
        <input
          id={`${idPrefix}-end`}
          name="endDateKey"
          type="date"
          defaultValue={values?.endDateKey ?? ""}
          className={inputCls}
        />
      </div>
    </div>
  );
}

function ExpenseRowActions({
  expenseId,
  editing,
  onEdit,
  onCancelEdit,
}: {
  expenseId: string;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {editing ? (
        <button
          type="button"
          onClick={onCancelEdit}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          title="Fechar edição"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Editar despesa"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
      <DeleteExpenseButton expenseId={expenseId} />
    </div>
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

function formatVigencia(startDateKey: string, endDateKey: string | null) {
  const start = startDateKey.split("-").reverse().join("/");
  if (!endDateKey) return `${start} – …`;
  return `${start} – ${endDateKey.split("-").reverse().join("/")}`;
}
