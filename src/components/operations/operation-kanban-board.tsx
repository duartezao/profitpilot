"use client";

import { useCallback, useState, useTransition } from "react";
import type { OperationTaskBoard, OperationTaskStatus } from "@/lib/operation-tasks-types";
import { OPERATION_TASK_STATUS_LABEL } from "@/lib/operation-tasks-types";
import { moveOperationTaskAction } from "@/app/(app)/operacao/actions";
import { TaskAssigneeBadge } from "@/components/operations/task-assignee-picker";
import { TaskAssigneeControl } from "@/components/operations/task-assignee-control";
import { cn } from "@/lib/utils";
import { Calendar, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

const COLUMNS: OperationTaskStatus[] = ["todo", "doing", "done"];

type KanbanTask = OperationTaskBoard["columns"]["todo"][number];

export function OperationKanbanBoard({
  board,
  canEdit,
  onDelete,
  onRefresh,
  compact = false,
}: {
  board: OperationTaskBoard;
  canEdit: boolean;
  onDelete?: (id: string) => void;
  onRefresh?: () => void;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<OperationTaskStatus | null>(null);
  const [local, setLocal] = useState(board.columns);

  const columns = pending ? local : board.columns;

  const moveTask = useCallback(
    (id: string, status: OperationTaskStatus, position: number) => {
      if (!canEdit) return;
      startTransition(async () => {
        setLocal((prev) => {
          const next = {
            todo: [...prev.todo],
            doing: [...prev.doing],
            done: [...prev.done],
          };
          let task: KanbanTask | undefined;
          for (const col of COLUMNS) {
            const idx = next[col].findIndex((t) => t.id === id);
            if (idx >= 0) {
              task = next[col].splice(idx, 1)[0];
              break;
            }
          }
          if (!task) return prev;
          task = { ...task, status };
          next[status].splice(position, 0, task);
          return next;
        });
        const result = await moveOperationTaskAction({ id, status, position });
        if (result.error) onRefresh?.();
      });
    },
    [canEdit, onRefresh],
  );

  function handleDrop(col: OperationTaskStatus, index: number) {
    if (!dragId || !canEdit) return;
    moveTask(dragId, col, index);
    setDragId(null);
    setDropCol(null);
  }

  return (
    <div
      className={cn(
        "flex gap-4 overflow-x-auto pb-1 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0",
        compact && "lg:grid-cols-1",
      )}
    >
      {COLUMNS.map((col) => (
        <section
          key={col}
          className={cn(
            "flex min-h-[200px] min-w-[min(100%,18rem)] shrink-0 snap-start flex-col rounded-lg border border-border bg-muted/20 sm:min-w-[20rem] lg:min-w-0",
            dropCol === col && dragId && "border-accent",
          )}
          onDragOver={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            setDropCol(col);
          }}
          onDragLeave={() => setDropCol((c) => (c === col ? null : c))}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(col, columns[col].length);
          }}
        >
          <header className="border-b border-border px-3 py-2.5">
            <h2 className="text-sm font-semibold">
              {OPERATION_TASK_STATUS_LABEL[col]}
            </h2>
            <p className="text-xs text-muted-foreground">
              {columns[col].length} tarefa
              {columns[col].length === 1 ? "" : "s"}
            </p>
          </header>
          <ul className="flex-1 space-y-2 p-2">
            {columns[col].length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                Vazio
              </li>
            ) : (
              columns[col].map((task, idx) => (
                <li
                  key={task.id}
                  draggable={canEdit && !pending}
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropCol(null);
                  }}
                  onDragOver={(e) => {
                    if (!canEdit || !dragId) return;
                    e.preventDefault();
                    setDropCol(col);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDrop(col, idx);
                  }}
                  className={cn(
                    "rounded-lg border border-border bg-surface p-3",
                    dragId === task.id && "opacity-50",
                    canEdit && "cursor-grab active:cursor-grabbing",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">
                      {task.title}
                    </p>
                    {canEdit && onDelete && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onDelete(task.id)}
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
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                      {task.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {canEdit ? (
                      <TaskAssigneeControl
                        taskId={task.id}
                        assigneeId={task.assigneeId}
                        assigneeName={task.assigneeName}
                        isAssignedToMe={task.isAssignedToMe}
                        members={board.members}
                        canEdit
                        compact
                        onUpdated={onRefresh}
                      />
                    ) : (
                      task.assigneeName && (
                        <TaskAssigneeBadge
                          name={task.assigneeName}
                          isSelf={task.isAssignedToMe}
                          compact
                        />
                      )
                    )}
                  </div>
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
  );
}
