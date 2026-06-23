import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { OperationTask } from "@/models/OperationTask";
import { Store } from "@/models/Store";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import type { CurrentUser } from "@/lib/auth";
import {
  normalizeOperationTaskStatus,
  type OperationTaskBoard,
  type OperationTaskView,
} from "@/lib/operation-tasks-types";

export type { OperationTaskBoard, OperationTaskView, OperationTaskStatus } from "@/lib/operation-tasks-types";
export {
  OPERATION_TASK_STATUSES,
  OPERATION_TASK_STATUS_LABEL,
  normalizeOperationTaskStatus,
} from "@/lib/operation-tasks-types";

function formatDue(d: Date | null | undefined): {
  iso: string | null;
  label: string | null;
  isOverdue: boolean;
} {
  if (!d) return { iso: null, label: null, isOverdue: false };
  const iso = d.toISOString();
  const label = d.toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { iso, label, isOverdue: end < new Date() };
}

export async function buildOperationTaskBoard(
  user: CurrentUser,
  filter: "all" | "workspace" | "store",
  storeId?: string | null,
): Promise<OperationTaskBoard> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(user.workspaceId);

  const storeDocs = await Store.find(activeStoreQueryForUser(user))
    .select("name")
    .sort({ name: 1 })
    .lean();
  const stores = storeDocs.map((s) => ({ id: String(s._id), name: s.name }));
  const allowedStoreIds = new Set(stores.map((s) => s.id));
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));

  const query: Record<string, unknown> = {
    workspaceId: wsId,
    deletedAt: null,
  };

  if (filter === "workspace") {
    query.storeId = null;
  } else if (filter === "store" && storeId && allowedStoreIds.has(storeId)) {
    query.storeId = new mongoose.Types.ObjectId(storeId);
  } else if (filter === "store" && storeId) {
    return { columns: { todo: [], doing: [], done: [] }, stores };
  }

  const rows = await OperationTask.find(query)
    .sort({ status: 1, position: 1, updatedAt: -1 })
    .lean();

  const columns: OperationTaskBoard["columns"] = {
    todo: [],
    doing: [],
    done: [],
  };

  for (const row of rows) {
    const status = normalizeOperationTaskStatus(row.status ?? "todo");
    const sid = row.storeId ? String(row.storeId) : null;
    const due = formatDue(row.dueDate ?? null);
    const view: OperationTaskView = {
      id: String(row._id),
      title: row.title,
      description: (row.description ?? "").trim(),
      status,
      position: row.position ?? 0,
      storeId: sid,
      storeName: sid ? (storeNameById.get(sid) ?? "—") : null,
      dueDate: due.iso,
      dueDateLabel: due.label,
      isOverdue: due.isOverdue && status !== "done",
      updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
    columns[status].push(view);
  }

  return { columns, stores };
}
