import { TEAM_INVITES_ENABLED, TEAM_MEMBERSHIP_ENABLED } from "@/lib/feature-flags";

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

const ROLE_RANK: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

const ASSIGNABLE_ROLES: WorkspaceRole[] = ["admin", "editor", "viewer"];

export function roleRank(role: string): number {
  return ROLE_RANK[role as WorkspaceRole] ?? 0;
}

/** Só o proprietário gere membros (papéis, remoção). */
export function canManageMembers(
  actorRole: string,
  isWorkspaceOwner = false,
): boolean {
  if (!TEAM_MEMBERSHIP_ENABLED) return false;
  return actorRole === "owner" || isWorkspaceOwner;
}

/** Só o proprietário envia convites. */
export function canInviteMembers(
  actorRole: string,
  isWorkspaceOwner = false,
): boolean {
  if (!TEAM_INVITES_ENABLED) return false;
  return actorRole === "owner" || isWorkspaceOwner;
}

export function isProtectedOwnerRole(role: string): boolean {
  return role === "owner";
}

/**
 * Pode o ator alterar ou remover o membro alvo?
 * - Só o owner gere membros
 * - O owner do workspace não pode ser alterado/removido
 * - Só membros com cargo **inferior** ao do ator
 * - Não alterar o próprio acesso
 */
export function canModifyMember(
  actorRole: string,
  targetRole: string,
  actorUserId: string,
  targetUserId: string,
  isWorkspaceOwner = false,
): { ok: true } | { ok: false; error: string } {
  if (!canManageMembers(actorRole, isWorkspaceOwner)) {
    return { ok: false, error: "Só o proprietário pode gerir membros." };
  }
  if (isProtectedOwnerRole(targetRole)) {
    return {
      ok: false,
      error: "Não é possível alterar ou remover o proprietário.",
    };
  }
  if (actorUserId === targetUserId) {
    return { ok: false, error: "Não podes alterar o teu próprio acesso." };
  }
  const effectiveActorRole = isWorkspaceOwner ? "owner" : actorRole;
  if (roleRank(targetRole) >= roleRank(effectiveActorRole)) {
    return {
      ok: false,
      error: "Só podes gerir membros com cargo inferior ao teu.",
    };
  }
  return { ok: true };
}

/** Papéis que o ator pode atribuir (nunca `owner`). */
export function assignableRoles(
  actorRole: string,
  isWorkspaceOwner = false,
): WorkspaceRole[] {
  if (!canManageMembers(actorRole, isWorkspaceOwner)) return [];
  const rank = roleRank(isWorkspaceOwner ? "owner" : actorRole);
  return ASSIGNABLE_ROLES.filter((r) => roleRank(r) < rank);
}

export function canAssignRole(
  actorRole: string,
  newRole: string,
  isWorkspaceOwner = false,
): { ok: true } | { ok: false; error: string } {
  if (!canManageMembers(actorRole, isWorkspaceOwner)) {
    return { ok: false, error: "Só o proprietário pode alterar papéis." };
  }
  if (isProtectedOwnerRole(newRole)) {
    return { ok: false, error: "Não é possível atribuir o papel de proprietário." };
  }
  if (!ASSIGNABLE_ROLES.includes(newRole as WorkspaceRole)) {
    return { ok: false, error: "Papel inválido." };
  }
  const effectiveActorRole = isWorkspaceOwner ? "owner" : actorRole;
  if (roleRank(newRole) >= roleRank(effectiveActorRole)) {
    return {
      ok: false,
      error: "Só podes atribuir cargos inferiores ao teu.",
    };
  }
  return { ok: true };
}
