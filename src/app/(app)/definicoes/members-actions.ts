"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Membership } from "@/models/Membership";
import {
  canAssignRole,
  canManageMembers,
  canModifyMember,
} from "@/lib/rbac";
import { parseStoreIdsFromForm } from "@/lib/store-access";

export type MemberActionState = { ok?: boolean; error?: string };

async function loadMembership(
  membershipId: string,
  workspaceId: string,
) {
  await connectToDatabase();
  return Membership.findOne({
    _id: membershipId,
    workspaceId,
    status: "active",
  }).lean();
}

const updateRoleSchema = z.object({
  membershipId: z.string().trim().min(1),
  role: z.enum(["admin", "editor", "viewer"]),
});

export async function updateMemberRoleAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageMembers(user.role)) {
    return { error: "Só o proprietário pode alterar papéis." };
  }

  const parsed = updateRoleSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const assignCheck = canAssignRole(user.role, parsed.data.role);
  if (!assignCheck.ok) return { error: assignCheck.error };

  const membership = await loadMembership(
    parsed.data.membershipId,
    user.workspaceId,
  );
  if (!membership) return { error: "Membro não encontrado." };

  const modifyCheck = canModifyMember(
    user.role,
    membership.role,
    user.id,
    String(membership.userId),
  );
  if (!modifyCheck.ok) return { error: modifyCheck.error };

  await Membership.updateOne(
    { _id: membership._id },
    { $set: { role: parsed.data.role } },
  );

  revalidatePath("/definicoes");
  return { ok: true };
}

const revokeSchema = z.object({
  membershipId: z.string().trim().min(1),
});

export async function revokeMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageMembers(user.role)) {
    return { error: "Só o proprietário pode remover membros." };
  }

  const parsed = revokeSchema.safeParse({
    membershipId: formData.get("membershipId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const membership = await loadMembership(
    parsed.data.membershipId,
    user.workspaceId,
  );
  if (!membership) return { error: "Membro não encontrado." };

  const modifyCheck = canModifyMember(
    user.role,
    membership.role,
    user.id,
    String(membership.userId),
  );
  if (!modifyCheck.ok) return { error: modifyCheck.error };

  await Membership.updateOne(
    { _id: membership._id },
    { $set: { status: "revoked" } },
  );

  revalidatePath("/definicoes");
  return { ok: true };
}

const storeAccessSchema = z.object({
  membershipId: z.string().trim().min(1),
  storeScope: z.enum(["all", "selected"]),
});

export async function updateMemberStoreAccessAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageMembers(user.role)) {
    return { error: "Só o proprietário pode alterar acesso às lojas." };
  }

  const parsed = storeAccessSchema.safeParse({
    membershipId: formData.get("membershipId"),
    storeScope: formData.get("storeScope"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const storeIds = parseStoreIdsFromForm(formData.get("storeIds"));
  const storeAccess =
    parsed.data.storeScope === "all" ? ("all" as const) : storeIds;

  if (parsed.data.storeScope === "selected" && !storeIds.length) {
    return { error: "Selecciona pelo menos uma loja." };
  }

  const membership = await loadMembership(
    parsed.data.membershipId,
    user.workspaceId,
  );
  if (!membership) return { error: "Membro não encontrado." };

  const modifyCheck = canModifyMember(
    user.role,
    membership.role,
    user.id,
    String(membership.userId),
  );
  if (!modifyCheck.ok) return { error: modifyCheck.error };

  await Membership.updateOne(
    { _id: membership._id },
    { $set: { storeAccess } },
  );

  revalidatePath("/definicoes");
  revalidatePath("/", "layout");
  return { ok: true };
}
