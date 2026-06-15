"use client";

import { useActionState, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import {
  permanentlyDeleteStoreAction,
  reconfigureStoreImportAction,
  type StoreDataState,
} from "./store-data-actions";
import type { FeeConfig } from "@/lib/fee-schedule";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";
const btnDanger =
  "inline-flex items-center gap-1.5 rounded-lg border border-negative/40 px-3 py-1.5 text-sm font-medium text-negative hover:bg-negative/10 disabled:opacity-60";

export function StoreDataPanel({
  storeId,
  storeName,
  importStartDate,
  importFloorKey,
  initialFees,
  canEdit,
  canDelete,
}: {
  storeId: string;
  storeName: string;
  importStartDate: string;
  importFloorKey: string;
  initialFees: FeeConfig;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [ack, setAck] = useState(false);

  const [reconfigState, reconfigAction, reconfigPending] = useActionState<
    StoreDataState,
    FormData
  >(reconfigureStoreImportAction, {});

  const [deleteState, deleteAction, deletePending] = useActionState<
    StoreDataState,
    FormData
  >(permanentlyDeleteStoreAction, {});

  const canSubmitDelete = ack && confirmName.trim() === storeName;

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-start gap-2">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Reconfigurar importação</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Corrige a data de início ou as taxas iniciais sem apagar
                encomendas. Usa «Recalcular taxas» para actualizar o lucro nas
                orders já importadas.
              </p>
            </div>
          </div>

          <form action={reconfigAction} className="mt-4 space-y-4">
            <input type="hidden" name="storeId" value={storeId} />

            {reconfigState.error && (
              <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
                {reconfigState.error}
              </p>
            )}
            {reconfigState.ok && reconfigState.message && (
              <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-xs text-positive">
                {reconfigState.message}
              </p>
            )}

            <div>
              <label className={labelCls}>Importar dados desde</label>
              <input
                name="importStartDate"
                type="date"
                required
                defaultValue={importStartDate}
                max={new Date().toISOString().slice(0, 10)}
                disabled={reconfigPending}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Taxa inicial aplicável desde {importFloorKey} (actualiza ao
                guardar).
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Processamento (%)</label>
                <input
                  name="processingPercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue={initialFees.processingPercent}
                  required
                  disabled={reconfigPending}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Fixo / encomenda</label>
                <input
                  name="processingFixed"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={initialFees.processingFixed}
                  required
                  disabled={reconfigPending}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Taxa transação (%)</label>
                <input
                  name="transactionFeePercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue={initialFees.transactionFeePercent}
                  required
                  disabled={reconfigPending}
                  className={inputCls}
                />
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="recalculateFees"
                defaultChecked
                disabled={reconfigPending}
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span>
                Recalcular taxas em todas as encomendas já importadas (recomendado
                após corrigir %).
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="trimOrdersBeforeDate"
                disabled={reconfigPending}
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span className="text-muted-foreground">
                Remover encomendas anteriores à nova data (opcional — só se
                adiantaste a data de importação).
              </span>
            </label>

            <button
              type="submit"
              disabled={reconfigPending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
            >
              {reconfigPending ? "A guardar…" : "Guardar reconfiguração"}
            </button>
          </form>
        </div>
      )}

      {canDelete && (
        <div className="rounded-lg border border-negative/30 bg-negative/5 p-4 sm:p-5">
          <p className="text-sm font-medium text-negative">Apagar loja</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Remove a loja e <strong className="font-medium text-foreground">todos</strong>{" "}
            os dados na base de dados: encomendas, ad spend, COGS, notas,
            payouts, sessões, etc. Irreversível.
          </p>

          {!deleteOpen ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className={`${btnDanger} mt-3`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Apagar loja permanentemente
            </button>
          ) : (
            <form action={deleteAction} className="mt-4 space-y-3">
              <input type="hidden" name="storeId" value={storeId} />
              {deleteState.error && (
                <p className="text-xs text-negative">{deleteState.error}</p>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="acknowledge"
                  value="on"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>
                  Compreendo que todos os dados desta loja serão apagados de
                  forma permanente.
                </span>
              </label>
              <div>
                <label className={labelCls}>
                  Escreve o nome da loja para confirmar:{" "}
                  <Sensitive as="span" className="font-medium text-foreground">
                    {storeName}
                  </Sensitive>
                </label>
                <input
                  name="confirmName"
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  disabled={deletePending}
                  className={inputCls}
                  data-sensitive
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={deletePending || !canSubmitDelete}
                  className={btnDanger}
                >
                  {deletePending ? "A apagar…" : "Confirmar apagar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setConfirmName("");
                    setAck(false);
                  }}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
