"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { canAccessStore } from "@/lib/store-access";
import { Store } from "@/models/Store";
import { TestCollection } from "@/models/TestCollection";
import { TestProduct } from "@/models/TestProduct";
import { OperationTask } from "@/models/OperationTask";
import {
  normalizeOperationTaskStatus,
  type OperationTaskStatus,
} from "@/lib/operation-tasks-types";
import {
  normalizeAppViewMode,
  type AppViewMode,
} from "@/lib/app-view-mode";
import {
  getAppViewModeForUser,
  saveAppViewModeForUser,
} from "@/lib/app-view-mode-prefs";
import {
  normalizeCollectionPipelineStatus,
  normalizeProductPipelineStatus,
  normalizeStoreOperationStatus,
  type CollectionPipelineStatus,
} from "@/lib/operations-pipeline";
import {
  cycleDaysForStore,
  scheduleFieldsForStatusChange,
} from "@/lib/collection-operations";
import { parseDateInput, startOfDay } from "@/lib/period";

function canEditOperations(role: string): boolean {
  return roleRank(role) >= roleRank("editor");
}

export async function loadAppViewModeAction(): Promise<AppViewMode> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return getAppViewModeForUser(user.id, user.workspaceId);
}

export async function saveAppViewModeAction(
  mode: AppViewMode,
): Promise<{ ok?: boolean; error?: string; mode?: AppViewMode }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  try {
    const saved = await saveAppViewModeForUser(
      user.id,
      user.workspaceId,
      normalizeAppViewMode(mode),
    );
    return { ok: true, mode: saved };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Não foi possível guardar.",
    };
  }
}

const storeOpSchema = z.object({
  storeId: z.string().min(1),
  operationStatus: z.enum(["running", "waiting", "killed"]),
});

export async function updateStoreOperationStatusAction(
  input: z.infer<typeof storeOpSchema>,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditOperations(user.role)) {
    return { error: "Sem permissão para alterar o pipeline." };
  }

  const parsed = storeOpSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  if (!canAccessStore(user.storeAccess, parsed.data.storeId)) {
    return { error: "Sem acesso a esta loja." };
  }

  await connectToDatabase();
  const result = await Store.updateOne(
    {
      _id: new mongoose.Types.ObjectId(parsed.data.storeId),
      workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
      deletedAt: null,
    },
    {
      $set: {
        operationStatus: normalizeStoreOperationStatus(
          parsed.data.operationStatus,
        ),
      },
    },
  );

  if (result.matchedCount === 0) return { error: "Loja não encontrada." };

  revalidatePath("/operacao");
  return { ok: true };
}

const collectionSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  status: z.enum(["queue", "testing", "skipped", "winner", "failed"]),
  notes: z.string().trim().max(2000).optional(),
  scheduledStartDate: z.string().trim().optional(),
  cycleDays: z.coerce.number().int().min(1).max(60).optional(),
});

async function loadStoreForCollection(storeId: string, workspaceId: string) {
  return Store.findOne({
    _id: new mongoose.Types.ObjectId(storeId),
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    deletedAt: null,
  })
    .select("collectionTestCycleDays collectionReminderDaysBefore")
    .lean();
}

export async function updateStoreCollectionCycleAction(input: {
  storeId: string;
  cycleDays: number;
  reminderDaysBefore: number;
}): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditOperations(user.role)) return { error: "Sem permissão." };
  if (!canAccessStore(user.storeAccess, input.storeId)) {
    return { error: "Sem acesso." };
  }
  if (input.cycleDays < 1 || input.cycleDays > 60) {
    return { error: "Ciclo inválido (1–60 dias)." };
  }
  if (input.reminderDaysBefore < 0 || input.reminderDaysBefore > 14) {
    return { error: "Lembrete inválido (0–14 dias)." };
  }

  await connectToDatabase();
  const result = await Store.updateOne(
    {
      _id: new mongoose.Types.ObjectId(input.storeId),
      workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    },
    {
      $set: {
        collectionTestCycleDays: input.cycleDays,
        collectionReminderDaysBefore: input.reminderDaysBefore,
      },
    },
  );
  if (result.matchedCount === 0) return { error: "Loja não encontrada." };
  revalidatePath("/operacao/colecoes");
  return { ok: true };
}

export async function createTestCollectionAction(
  input: z.infer<typeof collectionSchema>,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditOperations(user.role)) {
    return { error: "Sem permissão." };
  }

  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  if (!canAccessStore(user.storeAccess, parsed.data.storeId)) {
    return { error: "Sem acesso a esta loja." };
  }

  await connectToDatabase();
  const store = await loadStoreForCollection(
    parsed.data.storeId,
    user.workspaceId,
  );
  if (!store) return { error: "Loja não encontrada." };

  const status = normalizeCollectionPipelineStatus(parsed.data.status);
  const scheduled =
    parsed.data.scheduledStartDate && parsed.data.scheduledStartDate.length
      ? parseDateInput(parsed.data.scheduledStartDate)
      : null;
  if (parsed.data.scheduledStartDate && !scheduled) {
    return { error: "Data de início inválida." };
  }

  const cycleDays = cycleDaysForStore(store, {
    cycleDays: parsed.data.cycleDays ?? null,
  });
  const schedulePatch = scheduleFieldsForStatusChange(
    status,
    null,
    { scheduledStartDate: scheduled },
    cycleDays,
    scheduled,
  );

  try {
    await TestCollection.create({
      workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
      storeId: new mongoose.Types.ObjectId(parsed.data.storeId),
      name: parsed.data.name,
      status,
      notes: parsed.data.notes ?? "",
      scheduledStartDate: scheduled,
      cycleDays: parsed.data.cycleDays ?? null,
      ...schedulePatch,
    });
  } catch {
    return { error: "Já existe uma coleção com este nome nesta loja." };
  }

  revalidatePath("/operacao");
  revalidatePath("/operacao/colecoes");
  revalidatePath("/dashboard");
  revalidatePath("/metricas");
  return { ok: true };
}

export async function updateTestCollectionAction(input: {
  id: string;
  status?: string;
  notes?: string;
  scheduledStartDate?: string | null;
  cycleDays?: number;
}): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditOperations(user.role)) return { error: "Sem permissão." };

  await connectToDatabase();
  const row = await TestCollection.findOne({
    _id: new mongoose.Types.ObjectId(input.id),
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    deletedAt: null,
  }).lean();

  if (!row) return { error: "Coleção não encontrada." };
  if (!canAccessStore(user.storeAccess, String(row.storeId))) {
    return { error: "Sem acesso." };
  }

  const store = await loadStoreForCollection(
    String(row.storeId),
    user.workspaceId,
  );
  if (!store) return { error: "Loja não encontrada." };

  const prevStatus = normalizeCollectionPipelineStatus(row.status ?? "queue");
  const nextStatus = input.status
    ? normalizeCollectionPipelineStatus(input.status)
    : prevStatus;

  let scheduled: Date | null | undefined;
  if (input.scheduledStartDate !== undefined) {
    if (!input.scheduledStartDate) scheduled = null;
    else {
      const d = parseDateInput(input.scheduledStartDate);
      if (!d) return { error: "Data de início inválida." };
      scheduled = startOfDay(d);
    }
  }

  const cycleDays = cycleDaysForStore(store, {
    cycleDays: input.cycleDays ?? row.cycleDays ?? null,
  });

  const schedulePatch = scheduleFieldsForStatusChange(
    nextStatus,
    prevStatus,
    {
      scheduledStartDate:
        scheduled !== undefined
          ? scheduled
          : row.scheduledStartDate
            ? new Date(row.scheduledStartDate)
            : null,
      testStartedAt: row.testStartedAt ? new Date(row.testStartedAt) : null,
      testEndsAt: row.testEndsAt ? new Date(row.testEndsAt) : null,
      cycleDays,
    },
    cycleDays,
    scheduled,
  );

  const $set: Record<string, unknown> = { ...schedulePatch };
  if (input.status) $set.status = nextStatus;
  if (input.notes !== undefined) $set.notes = input.notes.trim();
  if (input.cycleDays !== undefined) $set.cycleDays = input.cycleDays;
  if (scheduled !== undefined) $set.scheduledStartDate = scheduled;

  await TestCollection.updateOne({ _id: row._id }, { $set });
  revalidatePath("/operacao");
  revalidatePath("/operacao/colecoes");
  revalidatePath("/dashboard");
  revalidatePath("/metricas");
  return { ok: true };
}

export async function deleteTestCollectionAction(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditOperations(user.role)) return { error: "Sem permissão." };

  await connectToDatabase();
  const row = await TestCollection.findOne({
    _id: new mongoose.Types.ObjectId(id),
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    deletedAt: null,
  }).lean();

  if (!row) return { error: "Coleção não encontrada." };
  if (!canAccessStore(user.storeAccess, String(row.storeId))) {
    return { error: "Sem acesso." };
  }

  await TestCollection.updateOne({ _id: row._id }, { $set: { deletedAt: new Date() } });
  revalidatePath("/operacao");
  revalidatePath("/operacao/colecoes");
  return { ok: true };
}

const productSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  collectionName: z.string().trim().max(200).optional(),
  status: z.enum(["testing", "tested", "winner", "failed"]),
  notes: z.string().trim().max(2000).optional(),
});

export async function createTestProductAction(
  input: z.infer<typeof productSchema>,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditOperations(user.role)) return { error: "Sem permissão." };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  if (!canAccessStore(user.storeAccess, parsed.data.storeId)) {
    return { error: "Sem acesso a esta loja." };
  }

  await connectToDatabase();
  try {
    await TestProduct.create({
      workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
      storeId: new mongoose.Types.ObjectId(parsed.data.storeId),
      name: parsed.data.name,
      collectionName: parsed.data.collectionName ?? "",
      status: normalizeProductPipelineStatus(parsed.data.status),
      notes: parsed.data.notes ?? "",
    });
  } catch {
    return { error: "Já existe um produto com este nome nesta loja." };
  }

  revalidatePath("/operacao");
  revalidatePath("/operacao/produtos");
  return { ok: true };
}

export async function updateTestProductAction(input: {
  id: string;
  status?: string;
  notes?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditOperations(user.role)) return { error: "Sem permissão." };

  await connectToDatabase();
  const row = await TestProduct.findOne({
    _id: new mongoose.Types.ObjectId(input.id),
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    deletedAt: null,
  }).lean();

  if (!row) return { error: "Produto não encontrado." };
  if (!canAccessStore(user.storeAccess, String(row.storeId))) {
    return { error: "Sem acesso." };
  }

  const $set: Record<string, string> = {};
  if (input.status) {
    $set.status = normalizeProductPipelineStatus(input.status);
  }
  if (input.notes !== undefined) $set.notes = input.notes.trim();

  await TestProduct.updateOne({ _id: row._id }, { $set });
  revalidatePath("/operacao");
  revalidatePath("/operacao/produtos");
  return { ok: true };
}

export async function deleteTestProductAction(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditOperations(user.role)) return { error: "Sem permissão." };

  await connectToDatabase();
  const row = await TestProduct.findOne({
    _id: new mongoose.Types.ObjectId(id),
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    deletedAt: null,
  }).lean();

  if (!row) return { error: "Produto não encontrado." };
  if (!canAccessStore(user.storeAccess, String(row.storeId))) {
    return { error: "Sem acesso." };
  }

  await TestProduct.updateOne({ _id: row._id }, { $set: { deletedAt: new Date() } });
  revalidatePath("/operacao");
  revalidatePath("/operacao/produtos");
  return { ok: true };
}

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(["todo", "doing", "done"]).optional(),
  storeId: z.string().trim().optional(),
  dueDate: z.string().trim().optional(),
});

function revalidateTasks() {
  revalidatePath("/operacao");
  revalidatePath("/operacao/tarefas");
}

async function nextTaskPosition(
  workspaceId: mongoose.Types.ObjectId,
  status: OperationTaskStatus,
  storeId: mongoose.Types.ObjectId | null,
): Promise<number> {
  const last = await OperationTask.findOne({
    workspaceId,
    storeId,
    status,
    deletedAt: null,
  })
    .sort({ position: -1 })
    .select("position")
    .lean();
  return (last?.position ?? 0) + 1;
}

export async function createOperationTaskAction(
  input: z.infer<typeof taskSchema>,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditOperations(user.role)) return { error: "Sem permissão." };

  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const storeOid =
    parsed.data.storeId && parsed.data.storeId.length
      ? new mongoose.Types.ObjectId(parsed.data.storeId)
      : null;
  if (storeOid && !canAccessStore(user.storeAccess, parsed.data.storeId!)) {
    return { error: "Sem acesso a esta loja." };
  }

  const status = normalizeOperationTaskStatus(parsed.data.status ?? "todo");
  const dueDate =
    parsed.data.dueDate && parsed.data.dueDate.length
      ? new Date(parsed.data.dueDate)
      : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return { error: "Data de lembrete inválida." };
  }

  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(user.workspaceId);
  const position = await nextTaskPosition(wsId, status, storeOid);

  await OperationTask.create({
    workspaceId: wsId,
    storeId: storeOid,
    title: parsed.data.title,
    description: parsed.data.description ?? "",
    status,
    position,
    dueDate,
    createdBy: new mongoose.Types.ObjectId(user.id),
  });

  revalidateTasks();
  return { ok: true };
}

export async function updateOperationTaskAction(input: {
  id: string;
  title?: string;
  description?: string;
  status?: OperationTaskStatus;
  dueDate?: string | null;
  position?: number;
}): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditOperations(user.role)) return { error: "Sem permissão." };

  await connectToDatabase();
  const row = await OperationTask.findOne({
    _id: new mongoose.Types.ObjectId(input.id),
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    deletedAt: null,
  }).lean();

  if (!row) return { error: "Tarefa não encontrada." };
  if (
    row.storeId &&
    !canAccessStore(user.storeAccess, String(row.storeId))
  ) {
    return { error: "Sem acesso." };
  }

  const $set: Record<string, unknown> = {};
  if (input.title !== undefined) $set.title = input.title.trim();
  if (input.description !== undefined) $set.description = input.description.trim();
  if (input.status !== undefined) {
    $set.status = normalizeOperationTaskStatus(input.status);
  }
  if (input.position !== undefined) $set.position = input.position;
  if (input.dueDate !== undefined) {
    if (input.dueDate === null || input.dueDate === "") {
      $set.dueDate = null;
    } else {
      const d = new Date(input.dueDate);
      if (Number.isNaN(d.getTime())) return { error: "Data inválida." };
      $set.dueDate = d;
    }
  }

  await OperationTask.updateOne({ _id: row._id }, { $set });
  revalidateTasks();
  return { ok: true };
}

export async function moveOperationTaskAction(input: {
  id: string;
  status: OperationTaskStatus;
  position?: number;
}): Promise<{ ok?: boolean; error?: string }> {
  return updateOperationTaskAction({
    id: input.id,
    status: input.status,
    position: input.position,
  });
}

export async function deleteOperationTaskAction(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditOperations(user.role)) return { error: "Sem permissão." };

  await connectToDatabase();
  const row = await OperationTask.findOne({
    _id: new mongoose.Types.ObjectId(id),
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    deletedAt: null,
  }).lean();

  if (!row) return { error: "Tarefa não encontrada." };
  if (
    row.storeId &&
    !canAccessStore(user.storeAccess, String(row.storeId))
  ) {
    return { error: "Sem acesso." };
  }

  await OperationTask.updateOne({ _id: row._id }, { $set: { deletedAt: new Date() } });
  revalidateTasks();
  return { ok: true };
}
