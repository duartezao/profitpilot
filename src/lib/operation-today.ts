import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { OperationTask } from "@/models/OperationTask";
import { TestCollection } from "@/models/TestCollection";
import type { CurrentUser } from "@/lib/auth";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import { Store } from "@/models/Store";
import { User } from "@/models/User";
import {
  buildOperationsOverview,
  listTestCollections,
  listTestProducts,
  type OperationsOverview,
  type TestCollectionView,
  type TestProductView,
} from "@/lib/operations";
import { listCollectionRemindersForWorkspace } from "@/lib/collection-operations";
import type { CollectionReminder } from "@/lib/collection-schedule";
import {
  buildCollectionDecisionHint,
  type CollectionDecisionHint,
} from "@/lib/collection-decision";
import {
  mapOperationTaskRowToView,
} from "@/lib/operation-tasks";
import { listWorkspaceMemberOptions } from "@/lib/members";
import type { OperationTaskView, WorkspaceMemberOption } from "@/lib/operation-tasks-types";

export type OperationsTodayHub = OperationsOverview & {
  reminders: CollectionReminder[];
  collectionDecisions: CollectionDecisionHint[];
  testingCollections: TestCollectionView[];
  testingProducts: TestProductView[];
  openTasks: OperationTaskView[];
  taskMembers: WorkspaceMemberOption[];
  currentUserId: string;
  waitingStoreCount: number;
};

export async function buildOperationsTodayHub(
  user: CurrentUser,
  storeIdFilter?: string | null,
): Promise<OperationsTodayHub> {
  const overview = await buildOperationsOverview(user, storeIdFilter);

  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(user.workspaceId);
  const storeQuery = activeStoreQueryForUser(user);
  if (storeIdFilter) {
    storeQuery._id = new mongoose.Types.ObjectId(storeIdFilter);
  }

  const stores = await Store.find(storeQuery)
    .select("name collectionReminderDaysBefore")
    .lean();
  const storeIds = stores.map((s) => s._id);
  const storeMeta = new Map(
    stores.map((s) => [
      String(s._id),
      {
        name: s.name,
        reminderBefore: s.collectionReminderDaysBefore ?? 2,
      },
    ]),
  );

  const [reminders, collections, products, taskRows, taskMembers] = await Promise.all([
    storeIds.length
      ? listCollectionRemindersForWorkspace(user.workspaceId, storeIds)
      : Promise.resolve([]),
    listTestCollections(user, storeIdFilter),
    listTestProducts(user, storeIdFilter),
    OperationTask.find({
      workspaceId: wsId,
      deletedAt: null,
      status: { $ne: "done" },
      ...(storeIdFilter
        ? { storeId: new mongoose.Types.ObjectId(storeIdFilter) }
        : {}),
    })
      .sort({ dueDate: 1, position: 1, updatedAt: -1 })
      .limit(12)
      .lean(),
    listWorkspaceMemberOptions(user.workspaceId, user.id),
  ]);

  const testingCollections = collections.filter((c) => c.status === "testing");
  const testingProducts = products.filter((p) => p.status === "testing");

  const collectionRows = await TestCollection.find({
    workspaceId: wsId,
    storeId: { $in: storeIds },
    deletedAt: null,
    status: "testing",
    testStartedAt: { $ne: null },
    testEndsAt: { $ne: null },
  }).lean();

  const decisionCandidates = collectionRows.slice(0, 6);
  const collectionDecisions: CollectionDecisionHint[] = [];

  for (const c of decisionCandidates) {
    const meta = storeMeta.get(String(c.storeId));
    if (!meta || !c.testStartedAt || !c.testEndsAt) continue;
    const hint = await buildCollectionDecisionHint({
      workspaceId: user.workspaceId,
      storeId: String(c.storeId),
      storeName: meta.name,
      collectionId: String(c._id),
      collectionName: c.name,
      testStartedAt: new Date(c.testStartedAt),
      testEndsAt: new Date(c.testEndsAt),
      reminderDaysBefore: meta.reminderBefore,
      storeAccess: user.storeAccess,
    });
    if (hint) collectionDecisions.push(hint);
  }

  const assigneeIds = [
    ...new Set(
      taskRows
        .map((r) => (r.assigneeId ? String(r.assigneeId) : null))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const assigneeUsers = assigneeIds.length
    ? await User.find({
        _id: { $in: assigneeIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select("name")
        .lean()
    : [];
  const userNameById = new Map(
    assigneeUsers.map((u) => [String(u._id), u.name ?? "—"]),
  );
  const storeNameById = new Map(
    [...storeMeta.entries()].map(([id, m]) => [id, m.name]),
  );
  const taskCtx = {
    storeNameById,
    userNameById,
    currentUserId: user.id,
  };

  const openTasks: OperationTaskView[] = taskRows.map((row) =>
    mapOperationTaskRowToView(row, taskCtx),
  );

  openTasks.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  const waitingStoreCount = overview.storeCounts.waiting;

  return {
    ...overview,
    reminders,
    collectionDecisions,
    testingCollections,
    testingProducts,
    openTasks,
    taskMembers,
    currentUserId: user.id,
    waitingStoreCount,
  };
}
