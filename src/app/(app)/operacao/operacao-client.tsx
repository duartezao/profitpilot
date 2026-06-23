"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Layers,
  ListTodo,
  Plus,
  Store,
} from "lucide-react";
import type { OperationsTodayHub } from "@/lib/operation-today";
import type { CollectionDecisionHint } from "@/lib/collection-decision";
import {
  COLLECTION_PIPELINE_LABEL,
  COLLECTION_PIPELINE_STATUSES,
  PRODUCT_PIPELINE_LABEL,
  PRODUCT_PIPELINE_STATUSES,
  STORE_OPERATION_LABEL,
  STORE_OPERATION_STATUSES,
} from "@/lib/operations-pipeline";
import { hrefWithScope } from "@/lib/scope-query";
import {
  createOperationTaskAction,
  moveOperationTaskAction,
  updateStoreOperationStatusAction,
  updateTestCollectionAction,
  updateTestProductAction,
} from "@/app/(app)/operacao/actions";
import {
  collectionPipelineTone,
  PipelineStatusPill,
  productPipelineTone,
  storeOperationTone,
} from "@/components/operations/pipeline-status-pill";
import { TaskAssigneeBadge, TaskAssigneePicker } from "@/components/operations/task-assignee-picker";
import { cn } from "@/lib/utils";

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Layers;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-muted"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </Link>
  );
}

function DecisionCard({
  hint,
  canEdit,
  pending,
  onApply,
}: {
  hint: CollectionDecisionHint;
  canEdit: boolean;
  pending: boolean;
  onApply: (status: "winner" | "failed") => void;
}) {
  const tone =
    hint.suggestedStatus === "winner"
      ? "border-positive/30 bg-positive/5"
      : hint.suggestedStatus === "failed"
        ? "border-negative/30 bg-negative/5"
        : "border-warning/30 bg-warning/5";

  return (
    <div className={cn("rounded-lg border p-4", tone)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{hint.collectionName}</p>
          <p className="text-xs text-muted-foreground">{hint.storeName}</p>
        </div>
        <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium">
          Sugestão: {hint.suggestedLabel}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{hint.reason}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Ciclo · Lucro {hint.profitFmt} · REV {hint.revenueFmt}
        {hint.roas != null ? ` · ROAS ${hint.roasFmt}` : ""}
      </p>
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onApply("winner")}
            className="rounded-lg border border-positive/40 bg-positive/10 px-3 py-1.5 text-sm font-medium text-positive hover:bg-positive/20 disabled:opacity-60"
          >
            Performou
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onApply("failed")}
            className="rounded-lg border border-negative/40 bg-negative/10 px-3 py-1.5 text-sm font-medium text-negative hover:bg-negative/20 disabled:opacity-60"
          >
            Matada
          </button>
          <Link
            href={`/metricas?store=${encodeURIComponent(hint.storeId)}`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Ver métricas
          </Link>
        </div>
      )}
    </div>
  );
}

export function OperacaoClient({
  data,
  canEdit,
}: {
  data: OperationsTodayHub;
  canEdit: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [storesOpen, setStoresOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function applyCollectionDecision(
    collectionId: string,
    status: "winner" | "failed",
  ) {
    run(() => updateTestCollectionAction({ id: collectionId, status }));
  }

  const priorityCount =
    data.reminders.length +
    data.collectionDecisions.length +
    data.openTasks.filter((t) => t.isOverdue).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hoje</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tudo o que precisas de fazer agora — sem saltar entre páginas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickLink
            href={hrefWithScope("/operacao/colecoes", searchParams)}
            icon={Layers}
            label="Coleções"
          />
          <QuickLink
            href={hrefWithScope("/operacao/produtos", searchParams)}
            icon={FlaskConical}
            label="Produtos"
          />
          <QuickLink
            href={hrefWithScope("/operacao/tarefas", searchParams)}
            icon={ListTodo}
            label="Quadro"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      {/* Resumo rápido */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">Ações pendentes</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-accent">
            {priorityCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">Coleções a testar</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">
            {data.testingCollections.length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">Produtos a testar</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">
            {data.testingProducts.length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">Tarefas abertas</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">
            {data.openTasks.length}
          </p>
        </div>
      </div>

      {/* Lembretes */}
      {data.reminders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Lembretes de coleções</h2>
          <ul className="space-y-2">
            {data.reminders.map((r) => (
              <li
                key={`${r.collectionId}-${r.dueDateKey}`}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm",
                  r.urgency === "overdue"
                    ? "border-negative/30 bg-negative/5"
                    : r.urgency === "today"
                      ? "border-warning/30 bg-warning/5"
                      : "border-border bg-surface",
                )}
              >
                <span>
                  <span className="font-medium">{r.collectionName}</span>
                  <span className="text-muted-foreground"> · {r.storeName}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {r.message}
                  </span>
                </span>
                <Link
                  href={hrefWithScope("/operacao/colecoes", searchParams)}
                  className="shrink-0 text-accent hover:underline"
                >
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Decisões de ciclo */}
      {data.collectionDecisions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Decisão de ciclo</h2>
          <div className="space-y-3">
            {data.collectionDecisions.map((hint) => (
              <DecisionCard
                key={hint.collectionId}
                hint={hint}
                canEdit={canEdit}
                pending={pending}
                onApply={(st) =>
                  applyCollectionDecision(hint.collectionId, st)
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Tarefas — inline */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Tarefas</h2>
          <Link
            href={hrefWithScope("/operacao/tarefas", searchParams)}
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            Quadro completo
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {canEdit && (
          <form
            className="flex flex-col gap-2 lg:grid lg:grid-cols-[1fr_auto_auto_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!taskTitle.trim()) return;
              run(async () => {
                const result = await createOperationTaskAction({
                  title: taskTitle.trim(),
                  dueDate: taskDue || undefined,
                  assigneeId: taskAssignee || undefined,
                });
                if (!result.error) {
                  setTaskTitle("");
                  setTaskDue("");
                  setTaskAssignee("");
                }
                return result;
              });
            }}
          >
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Nova tarefa rápida…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <TaskAssigneePicker
              members={data.taskMembers}
              value={taskAssignee}
              onChange={setTaskAssignee}
              className="min-w-[10rem]"
            />
            <input
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={pending || !taskTitle.trim()}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </form>
        )}

        {data.openTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem tarefas abertas.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.openTasks.slice(0, 8).map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        moveOperationTaskAction({
                          id: task.id,
                          status: "done",
                        }),
                      )
                    }
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-60"
                    aria-label="Marcar como concluída"
                  >
                    <Check className="h-4 w-4 text-positive" />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {task.storeName ?? "Workspace"}
                    {task.assigneeName && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="inline-flex align-middle">
                          <TaskAssigneeBadge
                            name={task.assigneeName}
                            isSelf={task.isAssignedToMe}
                            compact
                          />
                        </span>
                      </>
                    )}
                    {task.dueDateLabel && (
                      <span
                        className={cn(
                          task.isOverdue && "font-medium text-negative",
                        )}
                      >
                        {" "}
                        · {task.isOverdue ? "Atrasada" : "Até"}{" "}
                        {task.dueDateLabel}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Coleções + produtos em teste — acções inline */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Coleções a testar</h2>
            <Link
              href={hrefWithScope("/operacao/colecoes", searchParams)}
              className="text-xs text-accent hover:underline"
            >
              Gerir
            </Link>
          </div>
          {data.testingCollections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma em teste.</p>
          ) : (
            <ul className="space-y-2">
              {data.testingCollections.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.storeName}
                    {c.cycleProgress ? ` · ${c.cycleProgress}` : ""}
                    {c.reminderText ? ` · ${c.reminderText}` : ""}
                  </p>
                  {canEdit ? (
                    <select
                      value={c.status}
                      disabled={pending}
                      onChange={(e) =>
                        run(() =>
                          updateTestCollectionAction({
                            id: c.id,
                            status: e.target.value,
                          }),
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    >
                      {COLLECTION_PIPELINE_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {COLLECTION_PIPELINE_LABEL[st]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-2">
                      <PipelineStatusPill
                        label={COLLECTION_PIPELINE_LABEL[c.status]}
                        tone={collectionPipelineTone(c.status)}
                      />
                    </div>
                  )}
                  <Link
                    href={(() => {
                      const p = new URLSearchParams(searchParams.toString());
                      p.set("store", c.storeId);
                      return hrefWithScope("/notas", p);
                    })()}
                    className="mt-2 inline-block text-xs text-accent hover:underline"
                  >
                    Relatório diário da loja
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Produtos a testar</h2>
            <Link
              href={hrefWithScope("/operacao/produtos", searchParams)}
              className="text-xs text-accent hover:underline"
            >
              Gerir
            </Link>
          </div>
          {data.testingProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum em teste.</p>
          ) : (
            <ul className="space-y-2">
              {data.testingProducts.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.storeName}
                    {p.collectionName ? ` · ${p.collectionName}` : ""}
                  </p>
                  {canEdit ? (
                    <select
                      value={p.status}
                      disabled={pending}
                      onChange={(e) =>
                        run(() =>
                          updateTestProductAction({
                            id: p.id,
                            status: e.target.value,
                          }),
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    >
                      {PRODUCT_PIPELINE_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {PRODUCT_PIPELINE_LABEL[st]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-2">
                      <PipelineStatusPill
                        label={PRODUCT_PIPELINE_LABEL[p.status]}
                        tone={productPipelineTone(p.status)}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Lojas — colapsável */}
      <section className="rounded-lg border border-border bg-surface">
        <button
          type="button"
          onClick={() => setStoresOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <Store className="h-4 w-4 text-muted-foreground" />
            Lojas ({data.storeCounts.running} a rodar
            {data.waitingStoreCount > 0
              ? `, ${data.waitingStoreCount} em espera`
              : ""}
            )
          </span>
          {storesOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {storesOpen && (
          <div className="border-t border-border p-4 pt-0">
            <div className="mb-3 flex justify-end">
              <Link
                href={hrefWithScope("/lojas", searchParams)}
                className="text-xs text-accent hover:underline"
              >
                Gerir lojas
              </Link>
            </div>
            <ul className="space-y-2">
              {data.stores.map((store) => (
                <li
                  key={store.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{store.name}</p>
                    {store.displayUrl && (
                      <p className="truncate text-xs text-muted-foreground">
                        {store.displayUrl}
                      </p>
                    )}
                  </div>
                  {canEdit ? (
                    <select
                      value={store.operationStatus}
                      disabled={pending}
                      onChange={(e) =>
                        run(() =>
                          updateStoreOperationStatusAction({
                            storeId: store.id,
                            operationStatus: e.target.value as
                              | "running"
                              | "waiting"
                              | "killed",
                          }),
                        )
                      }
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    >
                      {STORE_OPERATION_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {STORE_OPERATION_LABEL[st]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <PipelineStatusPill
                      label={STORE_OPERATION_LABEL[store.operationStatus]}
                      tone={storeOperationTone(store.operationStatus)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
