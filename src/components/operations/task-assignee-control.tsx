"use client";

import { useTransition } from "react";
import type { WorkspaceMemberOption } from "@/lib/operation-tasks-types";
import { updateOperationTaskAction } from "@/app/(app)/operacao/actions";
import { TaskAssigneeBadge, TaskAssigneePicker } from "./task-assignee-picker";
import { cn } from "@/lib/utils";

export function TaskAssigneeControl({
  taskId,
  assigneeId,
  assigneeName,
  isAssignedToMe,
  members,
  canEdit,
  compact = false,
  onUpdated,
  className,
}: {
  taskId: string;
  assigneeId: string | null;
  assigneeName: string | null;
  isAssignedToMe: boolean;
  members: WorkspaceMemberOption[];
  canEdit: boolean;
  compact?: boolean;
  onUpdated?: () => void;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    if (!assigneeName) return null;
    return (
      <TaskAssigneeBadge
        name={assigneeName}
        isSelf={isAssignedToMe}
        compact={compact}
        className={className}
      />
    );
  }

  function assign(nextId: string) {
    startTransition(async () => {
      const result = await updateOperationTaskAction({
        id: taskId,
        assigneeId: nextId || null,
      });
      if (!result.error) onUpdated?.();
    });
  }

  if (compact) {
    return (
      <select
        value={assigneeId ?? ""}
        disabled={pending}
        onChange={(e) => assign(e.target.value)}
        className={cn(
          "max-w-full truncate rounded border border-border bg-background px-2 py-1 text-xs",
          className,
        )}
        aria-label="Responsável"
      >
        <option value="">Sem responsável</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.isSelf ? `${m.name} (tu)` : m.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <TaskAssigneePicker
      members={members}
      value={assigneeId ?? ""}
      disabled={pending}
      onChange={assign}
      className={className}
    />
  );
}
