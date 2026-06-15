"use client";

import { useActionState } from "react";
import {
  addFeeScheduleEntryAction,
  type FeeScheduleState,
} from "./fee-schedule-actions";
import type { FeeScheduleEntryView } from "@/lib/fee-schedule";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-medium";

export function FeeSchedulePanel({
  storeId,
  canEdit,
  importStartDateKey,
  entries,
  currentLabel,
  defaultProcessingPercent,
  defaultProcessingFixed,
  defaultTransactionFeePercent,
}: {
  storeId: string;
  canEdit: boolean;
  importStartDateKey: string | null;
  entries: FeeScheduleEntryView[];
  currentLabel: string;
  defaultProcessingPercent: number;
  defaultProcessingFixed: number;
  defaultTransactionFeePercent: number;
}) {
  const [state, action, pending] = useActionState<
    FeeScheduleState,
    FormData
  >(addFeeScheduleEntryAction, {});

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4">
        <p className="text-sm font-medium">Taxas de processamento</p>
        <p className="text-xs text-muted-foreground">
          Quando a Shopify ou o gateway mudam a comissão, regista a nova taxa
          com a data em que passa a valer. Encomendas de dias anteriores
          mantêm a taxa já gravada — o lucro passado não muda.
        </p>
        <p className="mt-2 text-sm">
          Taxa actual:{" "}
          <span className="font-medium tabular-nums">{currentLabel}</span>
        </p>
      </div>

      {entries.length > 0 && (
        <div className="mb-4 rounded-lg border border-border">
          <div className="border-b border-border px-4 py-2">
            <p className="text-xs font-medium text-muted-foreground">
              Histórico de taxas
            </p>
          </div>
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li
                key={e.effectiveFromKey}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
              >
                <span className="tabular-nums text-muted-foreground">
                  Desde {e.effectiveFromLabel}
                  {e.isLatest ? (
                    <span className="ml-2 text-xs font-medium text-accent">
                      actual
                    </span>
                  ) : null}
                </span>
                <span className="font-medium tabular-nums">{e.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <form action={action} className="space-y-4 border-t border-border pt-4">
          <p className="text-sm font-medium">Nova taxa a partir de…</p>

          {state.error && (
            <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
              Taxa registada. Só encomendas a partir dessa data usam o valor
              novo.
            </p>
          )}

          <input type="hidden" name="storeId" value={storeId} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Válida a partir de</label>
              <input
                name="effectiveFromKey"
                type="date"
                min={importStartDateKey ?? undefined}
                defaultValue={today}
                className={inputCls}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Ex.: a comissão mudou hoje — escolhe a data de hoje. Dias
                anteriores ficam com a taxa anterior.
              </p>
            </div>
            <div>
              <label className={labelCls}>Percentagem (%)</label>
              <input
                name="processingPercent"
                type="number"
                step="0.01"
                min="0"
                placeholder="1.5"
                defaultValue={defaultProcessingPercent}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Fixo por encomenda</label>
              <input
                name="processingFixed"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.30"
                defaultValue={defaultProcessingFixed}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>
                Taxa extra (%){" "}
                <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                name="transactionFeePercent"
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                defaultValue={defaultTransactionFeePercent}
                className={inputCls}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "A guardar…" : "Registar nova taxa"}
          </button>
        </form>
      )}
    </div>
  );
}
