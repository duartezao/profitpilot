export type OperationTaskStatus = "todo" | "doing" | "done";

export const OPERATION_TASK_STATUSES: OperationTaskStatus[] = [
  "todo",
  "doing",
  "done",
];

export const OPERATION_TASK_STATUS_LABEL: Record<OperationTaskStatus, string> = {
  todo: "Por fazer",
  doing: "Em progresso",
  done: "Concluído",
};

export type WorkspaceMemberOption = {
  userId: string;
  name: string;
  isSelf: boolean;
};

export type OperationTaskView = {
  id: string;
  title: string;
  description: string;
  status: OperationTaskStatus;
  position: number;
  storeId: string | null;
  storeName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  isAssignedToMe: boolean;
  dueDate: string | null;
  dueDateLabel: string | null;
  isOverdue: boolean;
  updatedAt: string;
};

export type OperationTaskBoard = {
  columns: Record<OperationTaskStatus, OperationTaskView[]>;
  stores: { id: string; name: string }[];
  members: WorkspaceMemberOption[];
  currentUserId: string;
};

export function normalizeOperationTaskStatus(
  raw: string | null | undefined,
): OperationTaskStatus {
  if (raw === "doing" || raw === "done") return raw;
  return "todo";
}
