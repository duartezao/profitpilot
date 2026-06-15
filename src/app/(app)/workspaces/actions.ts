"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import {
  getCurrentUser,
  switchWorkspace,
} from "@/lib/auth";
import { Workspace } from "@/models/Workspace";
import { Membership } from "@/models/Membership";
import {
  deleteOwnedWorkspace,
  renameOwnedWorkspace,
} from "@/lib/workspaces";

export type WorkspaceActionState = { ok?: boolean; error?: string };

const createSchema = z.object({
  name: z.string().trim().min(1, "Dá um nome ao workspace."),
});

const renameSchema = z.object({
  workspaceId: z.string().trim().min(1),
  name: z.string().trim().min(1, "Dá um nome ao workspace."),
});

const deleteSchema = z.object({
  workspaceId: z.string().trim().min(1),
  confirmName: z.string().optional(),
  acknowledgeDataLoss: z.string().optional(),
});

export async function switchWorkspaceAction(
  _prev: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaceId = String(formData.get("workspaceId") ?? "");
  if (!workspaceId) return { error: "Workspace inválido." };

  try {
    await switchWorkspace(workspaceId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível trocar." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function createWorkspaceAction(
  _prev: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = createSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nome inválido." };
  }

  await connectToDatabase();
  const workspace = await Workspace.create({
    name: parsed.data.name,
    ownerId: user.id,
  });

  await Membership.create({
    userId: user.id,
    workspaceId: workspace._id,
    role: "owner",
    storeAccess: "all",
  });

  await switchWorkspace(String(workspace._id));

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function renameWorkspaceAction(
  _prev: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = renameSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await renameOwnedWorkspace(
      user.id,
      parsed.data.workspaceId,
      parsed.data.name,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível guardar." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/definicoes");
  return { ok: true };
}

export async function deleteWorkspaceAction(
  _prev: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = deleteSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    confirmName: formData.get("confirmName") ?? undefined,
    acknowledgeDataLoss: formData.get("acknowledgeDataLoss") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Pedido inválido." };
  }

  const deletedId = parsed.data.workspaceId;

  try {
    await deleteOwnedWorkspace(user.id, deletedId, {
      confirmName: parsed.data.confirmName,
      acknowledgeDataLoss: parsed.data.acknowledgeDataLoss === "true",
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível apagar." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/definicoes");

  redirect("/definicoes#meus-workspaces");
}
