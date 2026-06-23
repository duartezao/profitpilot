"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { OperationsOverview } from "@/lib/operations";
import {
  COLLECTION_PIPELINE_LABEL,
  COLLECTION_PIPELINE_STATUSES,
  PRODUCT_PIPELINE_LABEL,
  PRODUCT_PIPELINE_STATUSES,
  STORE_OPERATION_HINT,
  STORE_OPERATION_LABEL,
  STORE_OPERATION_STATUSES,
} from "@/lib/operations-pipeline";
import { hrefWithScope } from "@/lib/scope-query";
import { updateStoreOperationStatusAction } from "@/app/(app)/operacao/actions";
import {
  collectionPipelineTone,
  PipelineStatusPill,
  productPipelineTone,
  storeOperationTone,
} from "@/components/operations/pipeline-status-pill";
import { cn } from "@/lib/utils";

function CountCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "positive" | "warning" | "negative" | "accent";
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "warning"
        ? "text-warning"
        : tone === "negative"
          ? "text-negative"
          : tone === "accent"
            ? "text-accent"
            : "text-foreground";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
    </div>
  );
}

export function OperacaoClient({
  data,
  canEdit,
}: {
  data: OperationsOverview;
  canEdit: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function updateStore(storeId: string, operationStatus: string) {
    if (!canEdit) return;
    setError(null);
    startTransition(async () => {
      const result = await updateStoreOperationStatusAction({
        storeId,
        operationStatus: operationStatus as "running" | "waiting" | "killed",
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operação</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pipeline de lojas, coleções e produtos em teste — independente das
          métricas financeiras.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Lojas</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <CountCard
            label="A rodar"
            value={data.storeCounts.running}
            tone="positive"
          />
          <CountCard
            label="Em espera"
            value={data.storeCounts.waiting}
            tone="warning"
          />
          <CountCard
            label="Matadas"
            value={data.storeCounts.killed}
            tone="negative"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Estado por loja</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href={hrefWithScope("/operacao/tarefas", searchParams)}
              className="text-accent hover:underline"
            >
              Tarefas
            </Link>
            <Link
              href={hrefWithScope("/lojas", searchParams)}
              className="text-accent hover:underline"
            >
              Gerir lojas
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Loja</th>
                <th className="px-3 py-2 font-medium">URL</th>
                <th className="px-3 py-2 font-medium">Operação</th>
              </tr>
            </thead>
            <tbody>
              {data.stores.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    Nenhuma loja activa. Adiciona uma em Lojas.
                  </td>
                </tr>
              ) : (
                data.stores.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 font-medium">{s.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {s.displayUrl ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {canEdit ? (
                        <select
                          value={s.operationStatus}
                          disabled={pending}
                          title={STORE_OPERATION_HINT[s.operationStatus]}
                          onChange={(e) =>
                            updateStore(s.id, e.target.value)
                          }
                          className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                        >
                          {STORE_OPERATION_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {STORE_OPERATION_LABEL[st]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <PipelineStatusPill
                          label={STORE_OPERATION_LABEL[s.operationStatus]}
                          tone={storeOperationTone(s.operationStatus)}
                        />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Coleções</h2>
            <Link
              href={hrefWithScope("/operacao/colecoes", searchParams)}
              className="text-sm text-accent hover:underline"
            >
              Ver todas
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COLLECTION_PIPELINE_STATUSES.map((st) => (
              <CountCard
                key={st}
                label={COLLECTION_PIPELINE_LABEL[st]}
                value={data.collectionCounts[st]}
              />
            ))}
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.recentCollections.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">
                Ainda sem coleções registadas.
              </li>
            ) : (
              data.recentCollections.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.storeName}</p>
                  </div>
                  <PipelineStatusPill
                    label={c.statusLabel}
                    tone={collectionPipelineTone(c.status)}
                  />
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Produtos em teste</h2>
            <Link
              href={hrefWithScope("/operacao/produtos", searchParams)}
              className="text-sm text-accent hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PRODUCT_PIPELINE_STATUSES.map((st) => (
              <CountCard
                key={st}
                label={PRODUCT_PIPELINE_LABEL[st]}
                value={data.productCounts[st]}
              />
            ))}
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.recentProducts.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">
                Ainda sem produtos registados.
              </li>
            ) : (
              data.recentProducts.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.storeName}
                      {p.collectionName ? ` · ${p.collectionName}` : ""}
                    </p>
                  </div>
                  <PipelineStatusPill
                    label={p.statusLabel}
                    tone={productPipelineTone(p.status)}
                  />
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
