"use client";

import { useActionState, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { CogsDayRow } from "@/lib/manual-cogs";
import { storeBerRoas, fmtBerRoas } from "@/lib/profit";
import { saveManualCogsDayAction, type ManualCogsState } from "./actions";
import { CogsCurrencySelect } from "./cogs-currency-select";
import { Sensitive } from "@/components/privacy-mode";
import { DecimalInput } from "@/components/decimal-input";

const inputCls =
  "w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus:border-accent";

function fmt(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

function parseLocaleAmount(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** COGS em moeda base a partir do valor digitado (preview). */
function previewCogsBase(
  draftAmount: string,
  draftCurrency: string,
  row: CogsDayRow,
): number | null {
  const input = parseLocaleAmount(draftAmount);
  if (input == null) return null;
  const cur = draftCurrency.toUpperCase();
  const base = row.baseCurrency.toUpperCase();
  if (cur === base) return input;
  if (row.fxRate != null && row.fxRate > 0 && cur === (row.inputCurrency ?? "").toUpperCase()) {
    return input * row.fxRate;
  }
  return null;
}

function DayCogsRowForm({
  row,
  storeId,
  defaultCurrency,
}: {
  row: CogsDayRow;
  storeId: string;
  defaultCurrency: string;
}) {
  const [saveState, doSave, saving] = useActionState<ManualCogsState, FormData>(
    saveManualCogsDayAction,
    {},
  );

  const missing = row.amount === null;
  const defaults =
    row.inputAmount != null && row.inputCurrency
      ? { amount: String(row.inputAmount), currency: row.inputCurrency }
      : row.amount != null
        ? { amount: String(row.amount), currency: row.baseCurrency }
        : { amount: "", currency: defaultCurrency };

  const [draftAmount, setDraftAmount] = useState(defaults.amount);
  const [draftCurrency, setDraftCurrency] = useState(defaults.currency);

  const liveBer = useMemo(() => {
    const cogsBase = previewCogsBase(draftAmount, draftCurrency, row);
    if (cogsBase == null) return row.ber;
    return storeBerRoas({
      revenue: row.revenue,
      cogs: cogsBase,
      fees: row.fees,
    });
  }, [draftAmount, draftCurrency, row]);

  const previewCogs = previewCogsBase(draftAmount, draftCurrency, row);
  const berIsPreview =
    previewCogs != null &&
    (row.amount == null || Math.abs(previewCogs - (row.amount ?? 0)) > 0.005);
  const liveBerFmt = fmtBerRoas(liveBer);

  if (!row.hasOrders) {
    return (
      <tr className="border-t border-border align-middle text-muted-foreground">
        <td className="px-4 py-3 tabular-nums">{row.label}</td>
        <td className="px-4 py-3 text-right">—</td>
        <td className="px-4 py-3 text-right">—</td>
        <td className="px-4 py-3 text-right">—</td>
        <td className="px-4 py-3 text-xs">Sem vendas</td>
      </tr>
    );
  }

  return (
    <tr
      className={`border-t border-border align-middle ${missing ? "bg-warning/5" : ""}`}
    >
      <td className="px-4 py-3">
        <p className="font-medium tabular-nums">{row.label}</p>
        {row.isYesterday && (
          <span className="text-xs text-muted-foreground">Ontem</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {row.amount != null ? (
          <Sensitive>{fmt(row.amount, row.baseCurrency)}</Sensitive>
        ) : (
          <span className="text-warning">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
        {row.inputCurrency &&
        row.inputCurrency !== row.baseCurrency &&
        row.inputAmount != null ? (
          <Sensitive>
            {row.inputAmount} {row.inputCurrency}
            {row.fxRate != null ? ` · ${row.fxRate.toFixed(4)}` : ""}
          </Sensitive>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {liveBer != null ? (
          <span
            className="tabular-nums font-medium"
            title={
              berIsPreview
                ? "Pré-visualização com o COGS que estás a escrever (REV − COGS − taxas)"
                : "Break-even ROAS do dia com este COGS (REV − COGS − taxas)"
            }
          >
            <Sensitive>{liveBerFmt}</Sensitive>
            {berIsPreview && (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                prev.
              </span>
            )}
          </span>
        ) : (
          <span
            className="text-xs text-muted-foreground"
            title={
              row.revenue <= 0
                ? "Sem receita neste dia"
                : "Preenche o COGS para ver o BER"
            }
          >
            —
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <form action={doSave} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="date" value={row.dateKey} />
          <DecimalInput
            name="amount"
            placeholder="COGS"
            defaultValue={defaults.amount}
            className={inputCls}
            data-sensitive
            onChange={(e) => setDraftAmount(e.target.value)}
          />
          <CogsCurrencySelect
            defaultValue={defaults.currency}
            onChange={(e) => setDraftCurrency(e.target.value)}
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "…" : "Guardar"}
          </button>
          {saveState.ok && <Check className="h-4 w-4 text-positive" />}
          {saveState.error && (
            <span className="text-xs text-negative">{saveState.error}</span>
          )}
        </form>
      </td>
    </tr>
  );
}

export function DayCogsPanel({
  storeId,
  storeName,
  baseCurrency,
  inputCurrency,
  rows,
}: {
  storeId: string;
  storeName: string;
  baseCurrency: string;
  inputCurrency: string;
  rows: CogsDayRow[];
}) {
  const missingCount = rows.filter((r) => r.hasOrders && r.amount === null).length;
  const orderedRows = [...rows].sort((a, b) => {
    const aMissing = a.hasOrders && a.amount === null ? 1 : 0;
    const bMissing = b.hasOrders && b.amount === null ? 1 : 0;
    if (aMissing !== bMissing) return bMissing - aMissing;
    return b.dateKey.localeCompare(a.dateKey);
  });

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">COGS por dia</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Custo total dos produtos vendidos em cada dia em{" "}
          <Sensitive as="span">{storeName}</Sensitive>. Converte para{" "}
          {baseCurrency} na dashboard. O BER actualiza com o COGS desse dia
          (REV − COGS − taxas).
        </p>
        {missingCount > 0 && (
          <p className="mt-2 text-sm text-warning">
            {missingCount} dia{missingCount === 1 ? "" : "s"} com vendas sem COGS
            registado.
          </p>
        )}
      </div>
      <div className="max-h-[520px] overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-3">Dia</th>
              <th className="px-4 py-3 text-right">COGS ({baseCurrency})</th>
              <th className="px-4 py-3 text-right">Entrada</th>
              <th className="px-4 py-3 text-right">BER</th>
              <th className="px-4 py-3">Registar</th>
            </tr>
          </thead>
          <tbody>
            {orderedRows.map((r) => (
              <DayCogsRowForm
                key={r.dateKey}
                row={r}
                storeId={storeId}
                defaultCurrency={inputCurrency}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
