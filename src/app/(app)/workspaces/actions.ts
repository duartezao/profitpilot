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

export type WorkspaceActionState = { ok?: boolean; error?: string };

const createSchema = z.object({
  name: z.string().trim().min(1, "Dá um nome ao workspace."),
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
