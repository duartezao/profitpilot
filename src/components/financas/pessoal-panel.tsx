"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronLeft, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import {
  addPersonalExpenseAction,
  deletePersonalExpenseAction,
  updatePersonalExpenseAction,
  type PersonalExpenseActionState,
} from "@/app/(app)/financas/personal-expense-actions";
import type { PersonalExpenseRow } from "@/lib/personal-expenses-overview";
import {
  buildPersonalExpenseOverview,
  listRecentMonthKeys,
  resolvePersonalMonthRange,
  resolvePersonalWeekRange,
  shiftPersonalMonth,
  shiftPersonalWeek,
  sumProfitForRange,
  type PersonalViewMode,
} from "@/lib/personal-expenses-overview";
import { dateKeyInPeriod } from "@/lib/period-date-keys";
import { Sensitive } from "@/components/privacy-mode";
import { DecimalInput } from "@/components/decimal-input";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-medium";

type MemberOption = { userId: string; name: string; isSelf: boolean };

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  className,
}: {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function PessoalPanel({
  entries,
  members,
  currentUserId,
  canManageAny,
  baseCurrency,
  profitByDateKey,
}: {
  entries: PersonalExpenseRow[];
  members: MemberOption[];
  currentUserId: string;
  canManageAny: boolean;
  baseCurrency: string;
  profitByDateKey: Record<string, number>;
}) {
  const [viewMode, setViewMode] = useState<PersonalViewMode>("month");
  const [monthKey, setMonthKey] = useState(() => todayKey().slice(0, 7));
  const [weekAnchor, setWeekAnchor] = useState(() => todayKey());

  const [addState, addAction] = useActionState<
    PersonalExpenseActionState,
    FormData
  >(addPersonalExpenseAction, {});
  const [addFormKey, setAddFormKey] = useState(0);

  useEffect(() => {
    if (addState.ok) setAddFormKey((k) => k + 1);
  }, [addState.ok]);

  const monthOptions = useMemo(() => listRecentMonthKeys(24), []);

  const periodFilter = useMemo(
    () =>
      viewMode === "month"
        ? resolvePersonalMonthRange(monthKey)
        : resolvePersonalWeekRange(weekAnchor),
    [viewMode, monthKey, weekAnchor],
  );

  const companyProfit = useMemo(
    () => sumProfitForRange(profitByDateKey, periodFilter),
    [profitByDateKey, periodFilter],
  );

  const overview = useMemo(
    () =>
      buildPersonalExpenseOverview(
        entries,
        periodFilter,
        companyProfit,
        baseCurrency,
        members.map((m) => ({ userId: m.userId, userName: m.name })),
      ),
    [entries, periodFilter, companyProfit, baseCurrency, members],
  );

  const filtered = useMemo(
    () => entries.filter((e) => dateKeyInPeriod(e.dateKey, periodFilter)),
    [entries, periodFilter],
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Pessoal</h2>
        <p className="text-sm text-muted-foreground">
          Gastos pessoais dos sócios — vista semanal ou mensal, comparação entre
          pessoas. Não entram no lucro da dashboard nem no P&L.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(
            [
              ["week", "Semana"],
              ["month", "Mês"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewMode(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                viewMode === id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {viewMode === "month" ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() =>
                setMonthKey((k) => {
                  const next = shiftPersonalMonth(k, -1);
                  return monthOptions.includes(next) ? next : k;
                })
              }
              disabled={monthKey === monthOptions[monthOptions.length - 1]}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              className="min-w-[10rem] rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
            >
              {monthOptions.map((mk) => {
                const label = resolvePersonalMonthRange(mk).label;
                return (
                  <option key={mk} value={mk}>
                    {label}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              aria-label="Mês seguinte"
              onClick={() => setMonthKey((k) => shiftPersonalMonth(k, 1))}
              disabled={monthKey >= todayKey().slice(0, 7)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Semana anterior"
              onClick={() => setWeekAnchor((a) => shiftPersonalWeek(a, -1))}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9rem] text-center text-sm font-medium tabular-nums">
              {periodFilter.label}
            </span>
            <button
              type="button"
              aria-label="Semana seguinte"
              onClick={() => setWeekAnchor((a) => shiftPersonalWeek(a, 1))}
              disabled={periodFilter.endKey >= todayKey()}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-[20px] border border-border bg-background p-4">
          <p className="text-[13px] font-medium text-muted-foreground">
            Lucro empresa
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {overview.periodLabel}
          </p>
          <Sensitive
            title={overview.companyProfitFmt}
            className={cn(
              "mt-2 block text-xl font-semibold tabular-nums",
              overview.companyProfit >= 0 ? "text-positive" : "text-negative",
            )}
          >
            {overview.companyProfitFmt}
          </Sensitive>
        </div>
        <div className="rounded-[20px] border border-border bg-background p-4">
          <p className="text-[13px] font-medium text-muted-foreground">
            Gasto pessoal
          </p>
          <Sensitive
            title={overview.totalFmt}
            className="mt-2 block text-xl font-semibold tabular-nums"
          >
            {overview.totalFmt}
          </Sensitive>
        </div>
        <div className="rounded-[20px] border border-border bg-background p-4">
          <p className="text-[13px] font-medium text-muted-foreground">
            % do lucro
          </p>
          <Sensitive
            title={overview.pctOfProfitFmt}
            className="mt-2 block text-xl font-semibold tabular-nums"
          >
            {overview.pctOfProfitFmt}
          </Sensitive>
        </div>
        <div className="rounded-[20px] border border-border bg-background p-4">
          <p className="text-[13px] font-medium text-muted-foreground">
            Média / sócio
          </p>
          <Sensitive
            title={overview.averagePerPersonFmt}
            className="mt-2 block text-xl font-semibold tabular-nums"
          >
            {overview.averagePerPersonFmt}
          </Sensitive>
        </div>
      </div>

      {overview.byPerson.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-[13px] font-medium text-muted-foreground">
              Comparação entre sócios
            </h3>
            <p className="text-xs text-muted-foreground">
              Quota do gasto pessoal e diferença vs média do grupo.
            </p>
          </div>
          <div className="space-y-3 rounded-[20px] border border-border p-4">
            {overview.byPerson.map((p) => (
              <div key={p.userId} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium" data-sensitive>
                    {p.userName}
                    {p.userId === currentUserId ? " (tu)" : ""}
                  </p>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-right">
                    <Sensitive className="text-sm font-semibold tabular-nums">
                      {p.totalFmt}
                    </Sensitive>
                    <Sensitive className="text-xs text-muted-foreground tabular-nums">
                      {p.shareOfPersonalFmt} do grupo
                    </Sensitive>
                    <Sensitive
                      className={cn(
                        "text-xs tabular-nums",
                        p.vsAverage > 0
                          ? "text-negative"
                          : p.vsAverage < 0
                            ? "text-positive"
                            : "text-muted-foreground",
                      )}
                    >
                      {p.vsAverageFmt} vs média
                    </Sensitive>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/70 transition-[width]"
                    style={{ width: `${Math.max(p.barPct, p.totalBase > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.entryCount} registo{p.entryCount === 1 ? "" : "s"}
                  {p.pctOfProfit != null
                    ? ` · ${p.pctOfProfitFmt} do lucro empresa`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <form
        key={addFormKey}
        action={addAction}
        className="space-y-4 rounded-[20px] border border-border bg-background p-4"
      >
        <p className="text-sm font-medium">Nova despesa pessoal</p>

        {addState.error && (
          <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {addState.error}
          </p>
        )}
        {addState.ok && (
          <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
            Registo adicionado.
          </p>
        )}

        <EntryFormFields
          idPrefix="pe-add"
          members={members}
          currentUserId={currentUserId}
          canManageAny={canManageAny}
          baseCurrency={baseCurrency}
          defaultDateKey={todayKey()}
        />

        <SubmitButton
          idleLabel="Adicionar"
          pendingLabel="A guardar…"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        />
      </form>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ainda não há despesas pessoais em {overview.periodLabel}.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-muted-foreground">
                  <th className="pb-2 pr-3">Data</th>
                  <th className="pb-2 pr-3">Pessoa</th>
                  <th className="pb-2 pr-3">Descrição</th>
                  <th className="pb-2 pr-3 text-right">Valor</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    canEdit={e.userId === currentUserId || canManageAny}
                    members={members}
                    currentUserId={currentUserId}
                    canManageAny={canManageAny}
                    baseCurrency={baseCurrency}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 lg:hidden">
            {filtered.map((e) => (
              <EntryMobileCard
                key={e.id}
                entry={e}
                canEdit={e.userId === currentUserId || canManageAny}
                members={members}
                currentUserId={currentUserId}
                canManageAny={canManageAny}
                baseCurrency={baseCurrency}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EntryFormFields({
  idPrefix,
  members,
  currentUserId,
  canManageAny,
  baseCurrency,
  defaultDateKey,
  defaults,
}: {
  idPrefix: string;
  members: MemberOption[];
  currentUserId: string;
  canManageAny: boolean;
  baseCurrency: string;
  defaultDateKey: string;
  defaults?: {
    description?: string;
    amount?: number;
    currency?: string;
    dateKey?: string;
    userId?: string;
  };
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={`${idPrefix}-desc`}>
          Descrição
        </label>
        <input
          id={`${idPrefix}-desc`}
          name="description"
          required
          maxLength={200}
          defaultValue={defaults?.description}
          placeholder="Ex.: almoço, levantamento, etc."
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-amount`}>
          Valor
        </label>
        <DecimalInput
          id={`${idPrefix}-amount`}
          name="amount"
          required
          defaultValue={
            defaults?.amount != null
              ? String(defaults.amount).replace(".", ",")
              : undefined
          }
          placeholder="0,00"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-currency`}>
          Moeda
        </label>
        <select
          id={`${idPrefix}-currency`}
          name="currency"
          defaultValue={defaults?.currency ?? baseCurrency}
          className={inputCls}
        >
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-date`}>
          Data
        </label>
        <input
          id={`${idPrefix}-date`}
          name="dateKey"
          type="date"
          required
          defaultValue={defaults?.dateKey ?? defaultDateKey}
          className={inputCls}
        />
      </div>
      {canManageAny && members.length > 1 ? (
        <div>
          <label className={labelCls} htmlFor={`${idPrefix}-user`}>
            Pessoa
          </label>
          <select
            id={`${idPrefix}-user`}
            name="userId"
            defaultValue={defaults?.userId ?? currentUserId}
            className={inputCls}
          >
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
                {m.isSelf ? " (tu)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input
          type="hidden"
          name="userId"
          value={defaults?.userId ?? currentUserId}
        />
      )}
    </div>
  );
}

function DeleteIconButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Apagar"
      className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-negative disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function EntryEditForm({
  entry,
  members,
  currentUserId,
  canManageAny,
  baseCurrency,
  onDone,
}: {
  entry: PersonalExpenseRow;
  members: MemberOption[];
  currentUserId: string;
  canManageAny: boolean;
  baseCurrency: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState<PersonalExpenseActionState, FormData>(
    updatePersonalExpenseAction,
    {},
  );

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só fechar no sucesso
  }, [state.ok]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={entry.id} />
      {state.error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      <EntryFormFields
        idPrefix={`pe-edit-${entry.id}`}
        members={members}
        currentUserId={currentUserId}
        canManageAny={canManageAny}
        baseCurrency={baseCurrency}
        defaultDateKey={entry.dateKey}
        defaults={{
          description: entry.description,
          amount: entry.amount,
          currency: entry.currency,
          dateKey: entry.dateKey,
          userId: entry.userId,
        }}
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          idleLabel="Guardar"
          pendingLabel="A guardar…"
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function EntryRow({
  entry,
  canEdit,
  members,
  currentUserId,
  canManageAny,
  baseCurrency,
}: {
  entry: PersonalExpenseRow;
  canEdit: boolean;
  members: MemberOption[];
  currentUserId: string;
  canManageAny: boolean;
  baseCurrency: string;
}) {
  const [editing, setEditing] = useState(false);
  const [delState, delAction] = useActionState<
    PersonalExpenseActionState,
    FormData
  >(deletePersonalExpenseAction, {});

  return (
    <>
      <tr className="border-t border-border">
        <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">
          {entry.dateKey}
        </td>
        <td className="py-2.5 pr-3" data-sensitive>
          {entry.userName}
        </td>
        <td className="py-2.5 pr-3">{entry.description}</td>
        <td className="py-2.5 pr-3 text-right tabular-nums" data-sensitive>
          {entry.amountBaseFmt}
        </td>
        <td className="py-2.5 text-right">
          {canEdit && (
            <div className="inline-flex items-center gap-0.5">
              <button
                type="button"
                title={editing ? "Fechar" : "Editar"}
                onClick={() => setEditing((v) => !v)}
                className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {editing ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Pencil className="h-4 w-4" />
                )}
              </button>
              <form action={delAction}>
                <input type="hidden" name="id" value={entry.id} />
                <DeleteIconButton />
                {delState.error && (
                  <span className="sr-only">{delState.error}</span>
                )}
              </form>
            </div>
          )}
        </td>
      </tr>
      {editing && canEdit && (
        <tr className="border-t border-border bg-muted/30">
          <td colSpan={5} className="p-4">
            <EntryEditForm
              entry={entry}
              members={members}
              currentUserId={currentUserId}
              canManageAny={canManageAny}
              baseCurrency={baseCurrency}
              onDone={() => setEditing(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function EntryMobileCard({
  entry,
  canEdit,
  members,
  currentUserId,
  canManageAny,
  baseCurrency,
}: {
  entry: PersonalExpenseRow;
  canEdit: boolean;
  members: MemberOption[];
  currentUserId: string;
  canManageAny: boolean;
  baseCurrency: string;
}) {
  const [editing, setEditing] = useState(false);
  const [delState, delAction] = useActionState<
    PersonalExpenseActionState,
    FormData
  >(deletePersonalExpenseAction, {});

  return (
    <div className="rounded-[20px] border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{entry.description}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span data-sensitive>{entry.userName}</span>
            {" · "}
            <span className="tabular-nums">{entry.dateKey}</span>
          </p>
        </div>
        <Sensitive className="shrink-0 text-sm font-semibold tabular-nums">
          {entry.amountBaseFmt}
        </Sensitive>
      </div>
      {canEdit && !editing && (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Editar
          </button>
          <form action={delAction}>
            <input type="hidden" name="id" value={entry.id} />
            <SubmitButton
              idleLabel="Apagar"
              pendingLabel="A apagar…"
              className="text-xs text-muted-foreground hover:text-negative disabled:opacity-50"
            />
            {delState.error && (
              <p className="mt-1 text-xs text-negative">{delState.error}</p>
            )}
          </form>
        </div>
      )}
      {editing && canEdit && (
        <div className="mt-3">
          <EntryEditForm
            entry={entry}
            members={members}
            currentUserId={currentUserId}
            canManageAny={canManageAny}
            baseCurrency={baseCurrency}
            onDone={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}
