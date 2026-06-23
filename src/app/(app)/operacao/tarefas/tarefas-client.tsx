"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { OperationKanbanBoard } from "@/components/operations/operation-kanban-board";
import type { OperationTaskBoard } from "@/lib/operation-tasks-types";
import {
  createOperationTaskAction,
  deleteOperationTaskAction,
} from "@/app/(app)/operacao/actions";
import { TaskAssigneePicker } from "@/components/operations/task-assignee-picker";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function TarefasClient({
  board,
  canEdit,
  initialFilter,
  initialStoreId,
  initialAssigneeFilter = "all",
}: {
  board: OperationTaskBoard;
  canEdit: boolean;
  initialFilter: "all" | "workspace" | "store";
  initialStoreId?: string | null;
  initialAssigneeFilter?: "all" | "mine" | "unassigned";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(initialFilter);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taskStoreId, setTaskStoreId] = useState(initialStoreId ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState(initialAssigneeFilter);

  const storeOptions = useMemo(
    () => [{ id: "", name: "Workspace (geral)" }, ...board.stores],
    [board.stores],
  );

  function applyFilter(
    next: "all" | "workspace" | "store",
    store?: string,
    assignee?: "all" | "mine" | "unassigned",
  ) {
    setFilter(next);
    const params = new URLSearchParams(window.location.search);
    params.set("filter", next);
    if (next === "store" && store) params.set("taskStore", store);
    else params.delete("taskStore");
    const af = assignee ?? assigneeFilter;
    if (af !== "all") params.set("assignee", af);
    else params.delete("assignee");
    router.push(`/operacao/tarefas?${params.toString()}`);
  }

  function applyAssigneeFilter(next: "all" | "mine" | "unassigned") {
    setAssigneeFilter(next);
    const params = new URLSearchParams(window.location.search);
    params.set("filter", filter);
    if (filter === "store" && (initialStoreId ?? board.stores[0]?.id)) {
      params.set("taskStore", initialStoreId ?? board.stores[0]!.id);
    }
    if (next !== "all") params.set("assignee", next);
    else params.delete("assignee");
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tarefas e lembretes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Arrasta cartões entre colunas ou usa as setas no telemóvel.
          </p>
        </div>
        <Link
          href="/operacao"
          className="text-sm text-accent hover:underline"
        >
          Voltar a Hoje
        </Link>
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

      <div className="flex flex-wrap gap-2">
        <span className="self-center text-xs text-muted-foreground">
          Responsável:
        </span>
        {(
          [
            ["all", "Todas"],
            ["mine", "Minhas"],
            ["unassigned", "Sem responsável"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => applyAssigneeFilter(key)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium",
              assigneeFilter === key
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
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
                assigneeId: assigneeId || undefined,
              });
              if (result.error) setError(result.error);
              else {
                setTitle("");
                setDescription("");
                setDueDate("");
                setAssigneeId("");
                router.refresh();
              }
            });
          }}
        >
          <h2 className="text-sm font-semibold">Nova tarefa</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Responsável</span>
              <TaskAssigneePicker
                members={board.members}
                value={assigneeId}
                onChange={setAssigneeId}
              />
            </label>
            <label className="block text-sm sm:col-span-2 lg:col-span-5">
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

      <OperationKanbanBoard
        board={board}
        canEdit={canEdit}
        onDelete={(id) => run(() => deleteOperationTaskAction(id))}
        onRefresh={() => router.refresh()}
      />
    </div>
  );
}
