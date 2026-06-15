"use client";

import { useActionState } from "react";
import {
  addFeeScheduleEntryAction,
  type FeeScheduleState,
} from "./fee-schedule-actions";
import type { FeeScheduleEntryView } from "@/lib/fee-schedule";
import { DecimalInput } from "@/components/decimal-input";

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
  currencyConversionPercent = 0,
}: {
  storeId: string;
  canEdit: boolean;
  importStartDateKey: string | null;
  entries: FeeScheduleEntryView[];
  currentLabel: string;
  defaultProcessingPercent: number;
  defaultProcessingFixed: number;
  defaultTransactionFeePercent: number;
  currencyConversionPercent?: number;
}) {
  const [state, action, pending] = useActionState<
    FeeScheduleState,
    FormData
  >(addFeeScheduleEntryAction, {});

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4">
        <p className="text-sm font-medium">Taxas de processamento (fallback)</p>
        <p className="text-xs text-muted-foreground">
          Com Shopify Payments, as taxas reais vêm automaticamente das balance
          transactions no sync. Este calendário só se aplica a encomendas sem
          taxa real (gateway externo ou sem dados da Shopify).
        </p>
        <p className="mt-2 text-sm">
          Taxa actual:{" "}
          <span className="font-medium tabular-nums">{currentLabel}</span>
        </p>
        {currencyConversionPercent > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Inclui automaticamente{" "}
            {currencyConversionPercent.toFixed(2).replace(".", ",")}% de conversão
            de moeda Shopify (loja ≠ moeda de payout).
          </p>
        )}
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
              <DecimalInput
                name="processingPercent"
                placeholder="1.5"
                defaultValue={defaultProcessingPercent}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Fixo por encomenda</label>
              <DecimalInput
                name="processingFixed"
                placeholder="0.30"
                defaultValue={defaultProcessingFixed}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>
                Taxa extra gateway externo (%)
              </label>
              <DecimalInput
                name="transactionFeePercent"
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
