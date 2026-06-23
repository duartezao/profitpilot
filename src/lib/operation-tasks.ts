import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { OperationTask } from "@/models/OperationTask";
import { Store } from "@/models/Store";
import { User } from "@/models/User";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import type { CurrentUser } from "@/lib/auth";
import { listWorkspaceMemberOptions } from "@/lib/members";
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

type TaskRow = {
  _id: mongoose.Types.ObjectId;
  title: string;
  description?: string | null;
  status?: string | null;
  position?: number | null;
  storeId?: mongoose.Types.ObjectId | null;
  assigneeId?: mongoose.Types.ObjectId | null;
  dueDate?: Date | null;
  updatedAt?: Date | null;
};

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

async function loadUserNameMap(
  userIds: string[],
): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const users = await User.find({
    _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select("name")
    .lean();
  return new Map(users.map((u) => [String(u._id), u.name ?? "—"]));
}

export function mapOperationTaskRowToView(
  row: TaskRow,
  ctx: {
    storeNameById: Map<string, string>;
    userNameById: Map<string, string>;
    currentUserId: string;
  },
): OperationTaskView {
  const status = normalizeOperationTaskStatus(row.status ?? "todo");
  const sid = row.storeId ? String(row.storeId) : null;
  const aid = row.assigneeId ? String(row.assigneeId) : null;
  const due = formatDue(row.dueDate ?? null);
  return {
    id: String(row._id),
    title: row.title,
    description: (row.description ?? "").trim(),
    status,
    position: row.position ?? 0,
    storeId: sid,
    storeName: sid ? (ctx.storeNameById.get(sid) ?? "—") : null,
    assigneeId: aid,
    assigneeName: aid ? (ctx.userNameById.get(aid) ?? "—") : null,
    isAssignedToMe: Boolean(aid && aid === ctx.currentUserId),
    dueDate: due.iso,
    dueDateLabel: due.label,
    isOverdue: due.isOverdue && status !== "done",
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export type OperationTaskBoardFilter = {
  scope: "all" | "workspace" | "store";
  storeId?: string | null;
  assignee?: "all" | "mine" | "unassigned";
};

export async function buildOperationTaskBoard(
  user: CurrentUser,
  filter: OperationTaskBoardFilter | "all" | "workspace" | "store",
  storeId?: string | null,
): Promise<OperationTaskBoard> {
  const boardFilter: OperationTaskBoardFilter =
    typeof filter === "string"
      ? { scope: filter, storeId, assignee: "all" }
      : filter;

  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(user.workspaceId);

  const [storeDocs, members] = await Promise.all([
    Store.find(activeStoreQueryForUser(user)).select("name").sort({ name: 1 }).lean(),
    listWorkspaceMemberOptions(user.workspaceId, user.id),
  ]);

  const stores = storeDocs.map((s) => ({ id: String(s._id), name: s.name }));
  const allowedStoreIds = new Set(stores.map((s) => s.id));
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));

  const query: Record<string, unknown> = {
    workspaceId: wsId,
    deletedAt: null,
  };

  if (boardFilter.scope === "workspace") {
    query.storeId = null;
  } else if (
    boardFilter.scope === "store" &&
    boardFilter.storeId &&
    allowedStoreIds.has(boardFilter.storeId)
  ) {
    query.storeId = new mongoose.Types.ObjectId(boardFilter.storeId);
  } else if (boardFilter.scope === "store" && boardFilter.storeId) {
    return {
      columns: { todo: [], doing: [], done: [] },
      stores,
      members,
      currentUserId: user.id,
    };
  }

  if (boardFilter.assignee === "mine") {
    query.assigneeId = new mongoose.Types.ObjectId(user.id);
  } else if (boardFilter.assignee === "unassigned") {
    query.assigneeId = null;
  }

  const rows = await OperationTask.find(query)
    .sort({ status: 1, position: 1, updatedAt: -1 })
    .lean();

  const assigneeIds = [
    ...new Set(
      rows
        .map((r) => (r.assigneeId ? String(r.assigneeId) : null))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const userNameById = await loadUserNameMap(assigneeIds);

  const columns: OperationTaskBoard["columns"] = {
    todo: [],
    doing: [],
    done: [],
  };

  const ctx = {
    storeNameById,
    userNameById,
    currentUserId: user.id,
  };

  for (const row of rows) {
    const view = mapOperationTaskRowToView(row, ctx);
    columns[view.status].push(view);
  }

  return { columns, stores, members, currentUserId: user.id };
}
