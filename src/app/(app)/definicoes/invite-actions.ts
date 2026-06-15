"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, switchWorkspace } from "@/lib/auth";
import {
  createWorkspaceInvitation,
  acceptInvitation,
  declineInvitation,
  revokeInvitation,
} from "@/lib/invitations";
import { canManageMembers } from "@/lib/rbac";
import { parseStoreIdsFromForm } from "@/lib/store-access";

export type InviteActionState = { ok?: boolean; error?: string };

const inviteSchema = z.object({
  email: z.string().email("Email inválido."),
  role: z.enum(["admin", "editor", "viewer"]),
  storeScope: z.enum(["all", "selected"]),
});

export async function inviteMemberAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageMembers(user.role)) {
    return { error: "Só o proprietário pode convidar membros." };
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    storeScope: formData.get("storeScope"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const storeIds = parseStoreIdsFromForm(formData.get("storeIds"));
  const storeAccess =
    parsed.data.storeScope === "all" ? ("all" as const) : storeIds;

  const result = await createWorkspaceInvitation({
    workspaceId: user.workspaceId,
    invitedByUserId: user.id,
    actorRole: user.role,
    email: parsed.data.email,
    role: parsed.data.role,
    storeAccess,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/definicoes");
  return { ok: true };
}

export async function acceptInvitationAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const invitationId = String(formData.get("invitationId") ?? "").trim();
  if (!invitationId) return { error: "Convite inválido." };

  const result = await acceptInvitation(invitationId, user.id, user.email);
  if (!result.ok) return { error: result.error };

  await switchWorkspace(result.workspaceId);
  revalidatePath("/definicoes");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function declineInvitationAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const invitationId = String(formData.get("invitationId") ?? "").trim();
  if (!invitationId) return { error: "Convite inválido." };

  const result = await declineInvitation(invitationId, user.email);
  if (!result.ok) return { error: result.error };

  revalidatePath("/definicoes");
  return { ok: true };
}

export async function revokeInvitationAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageMembers(user.role)) {
    return { error: "Só o proprietário pode revogar convites." };
  }

  const invitationId = String(formData.get("invitationId") ?? "").trim();
  if (!invitationId) return { error: "Convite inválido." };

  const result = await revokeInvitation(invitationId, user.workspaceId);
  if (!result.ok) return { error: result.error };

  revalidatePath("/definicoes");
  return { ok: true };
}
