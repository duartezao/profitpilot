"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TestProductView } from "@/lib/operations";
import {
  PRODUCT_PIPELINE_LABEL,
  PRODUCT_PIPELINE_STATUSES,
} from "@/lib/operations-pipeline";
import {
  createTestProductAction,
  deleteTestProductAction,
  updateTestProductAction,
} from "@/app/(app)/operacao/actions";
import {
  PipelineStatusPill,
  productPipelineTone,
} from "@/components/operations/pipeline-status-pill";

type StoreOption = { id: string; name: string };

export function ProdutosTesteClient({
  rows,
  stores,
  canEdit,
  storeId,
}: {
  rows: TestProductView[];
  stores: StoreOption[];
  canEdit: boolean;
  storeId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [collectionName, setCollectionName] = useState("");
  const [notes, setNotes] = useState("");
  const [newStoreId, setNewStoreId] = useState(storeId ?? stores[0]?.id ?? "");
  const [newStatus, setNewStatus] = useState("testing");

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setName("");
        setCollectionName("");
        setNotes("");
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Produtos em teste</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanha produtos a testar, já testados, que performaram ou falharam.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      {canEdit && stores.length > 0 && (
        <form
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              createTestProductAction({
                storeId: newStoreId,
                name,
                collectionName,
                status: newStatus as (typeof PRODUCT_PIPELINE_STATUSES)[number],
                notes,
              }),
            );
          }}
        >
          <h2 className="text-sm font-semibold">Novo produto</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Loja</span>
              <select
                value={newStoreId}
                onChange={(e) => setNewStoreId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                required
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Produto</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="Ex. Difusor LED"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Coleção</span>
              <input
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="Opcional"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Estado</span>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              >
                {PRODUCT_PIPELINE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {PRODUCT_PIPELINE_LABEL[st]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">Notas</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="Opcional"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            Adicionar
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium">Loja</th>
              <th className="px-3 py-2 font-medium">Coleção</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Notas</th>
              {canEdit && <th className="px-3 py-2 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 6 : 5}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Sem produtos. Adiciona o primeiro acima.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5 font-medium">{row.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {row.storeName}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {row.collectionName || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <select
                        value={row.status}
                        disabled={pending}
                        onChange={(e) =>
                          run(() =>
                            updateTestProductAction({
                              id: row.id,
                              status: e.target.value,
                            }),
                          )
                        }
                        className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                      >
                        {PRODUCT_PIPELINE_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {PRODUCT_PIPELINE_LABEL[st]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <PipelineStatusPill
                        label={PRODUCT_PIPELINE_LABEL[row.status]}
                        tone={productPipelineTone(row.status)}
                      />
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 text-muted-foreground">
                    {row.notes || "—"}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() => deleteTestProductAction(row.id))
                        }
                        className="text-sm text-negative hover:underline disabled:opacity-60"
                      >
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
