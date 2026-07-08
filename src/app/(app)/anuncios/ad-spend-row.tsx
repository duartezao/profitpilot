"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { AdSpendDayRow } from "@/lib/ad-spend";
import { platformDefaultsFromLines } from "@/lib/ad-spend-platforms";
import {
  saveManualAdSpendAction,
  deleteManualAdSpendAction,
  type AdSpendState,
} from "./actions";
import { AdSpendPlatformFields } from "./ad-spend-platform-fields";
import { Sensitive } from "@/components/privacy-mode";

function fmt(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
    }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

export function AdSpendRow({
  row,
  storeId,
  canEdit,
  onChanged,
}: {
  row: AdSpendDayRow;
  storeId: string;
  canEdit: boolean;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saveState, doSave, saving] = useActionState<AdSpendState, FormData>(
    saveManualAdSpendAction,
    {},
  );
  const [deleteState, doDelete, deleting] = useActionState<AdSpendState, FormData>(
    deleteManualAdSpendAction,
    {},
  );

  useEffect(() => {
    if (saveState.ok || saveState.conflict) {
      onChanged?.();
      if (saveState.ok) setOpen(false);
    }
  }, [saveState.ok, saveState.conflict, onChanged]);

  useEffect(() => {
    if (deleteState.ok || deleteState.conflict) {
      onChanged?.();
    }
  }, [deleteState.ok, deleteState.conflict, onChanged]);

  const missing = row.amount === null;
  const isZero = row.amount === 0;
  const hasExtra = (row.extraFee ?? 0) > 0;
  const updatedLabel = row.updatedAt
    ? new Date(row.updatedAt).toLocaleTimeString("pt-PT", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const { defaults, inputCurrency } = row.lines.length
    ? platformDefaultsFromLines(row.lines)
    : {
        defaults: {},
        inputCurrency: row.inputCurrency ?? "USD",
      };

  return (
    <>
      <tr
        className={`border-t border-border align-middle ${missing ? "bg-warning/5" : ""}`}
      >
        <td className="px-4 py-3">
          <p className="font-medium tabular-nums">{row.label}</p>
          {row.isYesterday && (
            <span className="text-xs text-muted-foreground">Ontem</span>
          )}
        </td>
        <td className="px-4 py-3">
          {missing ? (
            <span className="text-xs font-medium text-warning">Em falta</span>
          ) : isZero ? (
            <span className="text-xs text-muted-foreground">0€ confirmado</span>
          ) : (
            <span className="text-xs text-muted-foreground">Fechado</span>
          )}
          {row.hasOrders && (
            <span className="ml-2 text-xs text-muted-foreground">· com vendas</span>
          )}
          {!missing && row.source && (
            <span className="ml-2 text-xs text-muted-foreground">
              · {row.source === "manual" ? "manual" : "API"}
              {updatedLabel ? ` · ${updatedLabel}` : ""}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {!missing && row.totalAmount != null && (
            <div data-sensitive>
              <p className="font-medium">
                {fmt(row.totalAmount, row.baseCurrency)}
              </p>
              {hasExtra && row.amount != null && (
                <p className="text-xs text-muted-foreground">
                  ads {fmt(row.amount, row.baseCurrency)}
                  {" + fees "}
                  {fmt(row.extraFee as number, row.baseCurrency)}
                </p>
              )}
              {row.lines.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {row.lines.map((l) => (
                    <li key={l.platform}>
                      {l.platformLabel.split(" ")[0]}:{" "}
                      {fmt(l.totalBase, row.baseCurrency)}
                      {l.agencyFeePercent > 0
                        ? ` (${l.agencyFeePercent}% ag.)`
                        : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          {canEdit && (
            <div className="flex flex-wrap items-center gap-1.5">
              {missing && (
                <form action={doSave} className="inline">
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="date" value={row.dateKey} />
                  <input type="hidden" name="explicitZero" value="1" />
                  <input
                    type="hidden"
                    name="inputCurrency"
                    value={inputCurrency}
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    0€
                  </button>
                </form>
              )}
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                {open ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Fechar
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    {missing ? "Preencher" : "Editar"}
                  </>
                )}
              </button>
            </div>
          )}
          {!canEdit && missing && (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          {canEdit && !missing && (
            <form action={doDelete}>
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="date" value={row.dateKey} />
              {row.revisionAt ? (
                <input
                  type="hidden"
                  name="ifMatchUpdatedAt"
                  value={row.revisionAt}
                />
              ) : null}
              <button
                type="submit"
                disabled={deleting}
                aria-label="Apagar registo"
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-negative disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </form>
          )}
        </td>
      </tr>
      {open && canEdit && (
        <tr className="border-t border-border bg-muted/20">
          <td colSpan={5} className="px-4 py-4">
            <form action={doSave} className="space-y-4">
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="date" value={row.dateKey} />
              {row.revisionAt ? (
                <input
                  type="hidden"
                  name="ifMatchUpdatedAt"
                  value={row.revisionAt}
                />
              ) : null}
              <p className="text-sm font-medium">
                <Sensitive>{row.label}</Sensitive>
              </p>
              <AdSpendPlatformFields
                defaults={defaults}
                inputCurrency={inputCurrency}
                compact
                showZeroOption
              />
              {saveState.error && (
                <p
                  className={`text-xs ${saveState.conflict ? "text-warning" : "text-negative"}`}
                >
                  {saveState.error}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "A guardar…" : "Guardar"}
                </button>
                {saveState.ok && <Check className="h-4 w-4 text-positive" />}
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
