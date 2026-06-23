"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Calendar, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import type { OperationTaskBoard, OperationTaskStatus } from "@/lib/operation-tasks-types";
import { OPERATION_TASK_STATUS_LABEL } from "@/lib/operation-tasks-types";
import {
  createOperationTaskAction,
  deleteOperationTaskAction,
  moveOperationTaskAction,
} from "@/app/(app)/operacao/actions";
import { cn } from "@/lib/utils";

const COLUMNS: OperationTaskStatus[] = ["todo", "doing", "done"];

export function TarefasClient({
  board,
  canEdit,
  initialFilter,
  initialStoreId,
}: {
  board: OperationTaskBoard;
  canEdit: boolean;
  initialFilter: "all" | "workspace" | "store";
  initialStoreId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(initialFilter);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taskStoreId, setTaskStoreId] = useState(initialStoreId ?? "");

  const storeOptions = useMemo(
    () => [{ id: "", name: "Workspace (geral)" }, ...board.stores],
    [board.stores],
  );

  function applyFilter(next: "all" | "workspace" | "store", store?: string) {
    setFilter(next);
    const params = new URLSearchParams(window.location.search);
    params.set("filter", next);
    if (next === "store" && store) params.set("taskStore", store);
    else params.delete("taskStore");
    router.push(`/operacao/tarefas?${params.toString()}`);
  }

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function moveTask(
    id: string,
    status: OperationTaskStatus,
    position: number,
  ) {
    run(() => moveOperationTaskAction({ id, status, position }));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Tarefas e lembretes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quadro estilo Trello — organiza por workspace ou por loja.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Todas"],
            ["workspace", "Workspace"],
            ["store", "Por loja"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (key === "store" && board.stores[0]) {
                applyFilter("store", initialStoreId ?? board.stores[0]!.id);
              } else {
                applyFilter(key);
              }
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium",
              filter === key
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
        {filter === "store" && board.stores.length > 0 && (
          <select
            value={initialStoreId ?? board.stores[0]?.id ?? ""}
            onChange={(e) => applyFilter("store", e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            {board.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      {canEdit && (
        <form
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await createOperationTaskAction({
                title,
                description,
                dueDate: dueDate || undefined,
                storeId: taskStoreId || undefined,
              });
              if (result.error) setError(result.error);
              else {
                setTitle("");
                setDescription("");
                setDueDate("");
                router.refresh();
              }
            });
          }}
        >
          <h2 className="text-sm font-semibold">Nova tarefa</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">Título</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="Ex. Lançar nova coleção"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Âmbito</span>
              <select
                value={taskStoreId}
                onChange={(e) => setTaskStoreId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              >
                {storeOptions.map((s) => (
                  <option key={s.id || "ws"} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Lembrete</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2 lg:col-span-4">
              <span className="mb-1 block text-muted-foreground">Notas</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="Opcional"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={pending || !title.trim()}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            Adicionar
          </button>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <section
            key={col}
            className="flex min-h-[280px] flex-col rounded-lg border border-border bg-muted/20"
          >
            <header className="border-b border-border px-3 py-2.5">
              <h2 className="text-sm font-semibold">
                {OPERATION_TASK_STATUS_LABEL[col]}
              </h2>
              <p className="text-xs text-muted-foreground">
                {board.columns[col].length} tarefa
                {board.columns[col].length === 1 ? "" : "s"}
              </p>
            </header>
            <ul className="flex-1 space-y-2 p-2">
              {board.columns[col].length === 0 ? (
                <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                  Vazio
                </li>
              ) : (
                board.columns[col].map((task, idx) => (
                  <li
                    key={task.id}
                    className="rounded-lg border border-border bg-surface p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">
                        {task.title}
                      </p>
                      {canEdit && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(() => deleteOperationTaskAction(task.id))
                          }
                          className="shrink-0 rounded p-1 text-muted-foreground hover:text-negative disabled:opacity-60"
                          aria-label="Remover tarefa"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {task.storeName ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {task.storeName}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Workspace
                      </p>
                    )}
                    {task.description && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-3">
                        {task.description}
                      </p>
                    )}
                    {task.dueDateLabel && (
                      <p
                        className={cn(
                          "mt-2 inline-flex items-center gap-1 text-xs",
                          task.isOverdue
                            ? "font-medium text-negative"
                            : "text-muted-foreground",
                        )}
                      >
                        <Calendar className="h-3 w-3" />
                        {task.dueDateLabel}
                      </p>
                    )}
                    {canEdit && (
                      <div className="mt-3 flex items-center justify-between gap-1 border-t border-border pt-2">
                        <button
                          type="button"
                          disabled={pending || col === "todo"}
                          onClick={() => {
                            const prev =
                              col === "doing"
                                ? "todo"
                                : col === "done"
                                  ? "doing"
                                  : "todo";
                            moveTask(task.id, prev, idx);
                          }}
                          className="rounded border border-border p-1 hover:bg-muted disabled:opacity-40"
                          aria-label="Mover para coluna anterior"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={pending || col === "done"}
                          onClick={() => {
                            const next =
                              col === "todo"
                                ? "doing"
                                : col === "doing"
                                  ? "done"
                                  : "done";
                            moveTask(task.id, next, idx);
                          }}
                          className="rounded border border-border p-1 hover:bg-muted disabled:opacity-40"
                          aria-label="Mover para coluna seguinte"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
