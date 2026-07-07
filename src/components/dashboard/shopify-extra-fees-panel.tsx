"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Receipt } from "lucide-react";
import { formatDateInput, addDays, startOfDay } from "@/lib/period";
import { EU_CATEGORY_FEE_EFFECTIVE_FROM } from "@/lib/eu-category-fees-types";
import type { EuCategoryFeeEntry } from "@/lib/eu-category-fees-types";
import { saveEuCategoryFeeDayAction, type ManualCogsState } from "@/app/(app)/cogs/actions";
import { CogsCurrencySelect } from "@/app/(app)/cogs/cogs-currency-select";
import { DecimalInput } from "@/components/decimal-input";
import { Sensitive } from "@/components/privacy-mode";
import { cn } from "@/lib/utils";

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none focus:border-accent";

function fmt(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

export function ShopifyExtraFeesPanel({
  storeId,
  storeName,
  baseCurrency,
  inputCurrency,
  entries,
  canEdit,
  defaultOpen = true,
  onSaved,
}: {
  storeId: string;
  storeName: string;
  baseCurrency: string;
  inputCurrency: string;
  entries: EuCategoryFeeEntry[];
  canEdit: boolean;
  defaultOpen?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const defaultDate = formatDateInput(addDays(startOfDay(new Date()), -1));
  const [open, setOpen] = useState(defaultOpen);
  const [dateKey, setDateKey] = useState(defaultDate);

  const [saveState, doSave, saving] = useActionState<ManualCogsState, FormData>(
    saveEuCategoryFeeDayAction,
    {},
  );

  useEffect(() => {
    if (!saveState.ok) return;
    router.refresh();
    onSaved?.();
  }, [saveState.ok, router, onSaved]);

  const existingForDate = entries.find((e) => e.dateKey === dateKey);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50 sm:p-5"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
            Taxa Shopify (fatura)
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Total da fatura Shopify (taxa EU por categoria) para{" "}
            <Sensitive as="span">{storeName}</Sensitive> — dia + valor. Opcional:
            só registas quando recebes a fatura.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium text-muted-foreground">
          {open ? (
            <>
              <ChevronUp className="h-4 w-4" />
              <span className="hidden sm:inline">Fechar</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              <span className="hidden sm:inline">Abrir</span>
            </>
          )}
        </span>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 border-t border-border px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
            <p className="text-sm text-muted-foreground">
              Quando a Shopify cobra na fatura (domínio{" "}
              <span className="font-mono text-xs">.shopify</span>), regista aqui o
              total desse dia para esta loja. Entra no COGS do lucro. Usa{" "}
              <span className="tabular-nums">0</span> se não houve taxa ou já está
              no custo do produto. Não é obrigatório preencher todos os dias com
              vendas — só quando tens a fatura.
            </p>

            {canEdit && (
              <form action={doSave} className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium">Registar taxa</p>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="min-w-[9rem] flex-1 sm:flex-none">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Dia da fatura
                    </label>
                    <input
                      type="date"
                      name="date"
                      value={dateKey}
                      min={EU_CATEGORY_FEE_EFFECTIVE_FROM}
                      onChange={(e) => setDateKey(e.target.value)}
                      className={cn(inputCls, "w-full")}
                      required
                    />
                  </div>
                  <div className="min-w-[7rem] flex-1 sm:flex-none">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Valor
                    </label>
                    <DecimalInput
                      name="amount"
                      placeholder="0"
                      defaultValue={
                        existingForDate?.inputAmount != null
                          ? String(existingForDate.inputAmount)
                          : existingForDate != null
                            ? String(existingForDate.amount)
                            : ""
                      }
                      key={`amount-${dateKey}-${existingForDate?.amount ?? "new"}`}
                      className={cn(inputCls, "w-full")}
                      data-sensitive
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Moeda
                    </label>
                    <CogsCurrencySelect
                      defaultValue={
                        existingForDate?.inputCurrency ?? inputCurrency
                      }
                    />
                  </div>
                  <div className="min-w-[10rem] flex-1 sm:min-w-[12rem]">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Nota (opcional)
                    </label>
                    <input
                      type="text"
                      name="note"
                      placeholder="ex. fatura #1234"
                      defaultValue={existingForDate?.note ?? ""}
                      key={`note-${dateKey}`}
                      className={cn(inputCls, "w-full")}
                      maxLength={500}
                    />
                  </div>
                  <input type="hidden" name="storeId" value={storeId} />
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? "A guardar…" : "Guardar"}
                  </button>
                  {saveState.ok && (
                    <span className="flex items-center gap-1 text-sm text-positive">
                      <Check className="h-4 w-4" />
                      Guardado
                    </span>
                  )}
                </div>
                {saveState.error && (
                  <p className="text-sm text-negative">{saveState.error}</p>
                )}
              </form>
            )}

            <div>
              <p className="mb-2 text-sm font-medium">
                Registos recentes
                {entries.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({entries.length})
                  </span>
                )}
              </p>
              {entries.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Ainda não há taxas registadas para esta loja.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {entries.map((e) => (
                    <li
                      key={e.dateKey}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium tabular-nums">{e.label}</p>
                        {e.note ? (
                          <p className="text-xs text-muted-foreground">{e.note}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="font-medium tabular-nums">
                          <Sensitive>{fmt(e.amount, e.baseCurrency)}</Sensitive>
                        </p>
                        {e.inputCurrency &&
                        e.inputCurrency !== e.baseCurrency &&
                        e.inputAmount != null ? (
                          <p className="text-xs text-muted-foreground">
                            <Sensitive>
                              {e.inputAmount} {e.inputCurrency}
                            </Sensitive>
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
