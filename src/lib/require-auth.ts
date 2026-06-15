import "server-only";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { canAccessStore } from "@/lib/store-access";
import { connectToDatabase } from "@/lib/db";
import { findStoreForUser } from "@/lib/store-scope";

export class AuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

/** Sessão válida com membership activo num workspace. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) {
    throw new AuthError(401, "Não autenticado.");
  }
  return user;
}

export function requireStoreAccess(user: CurrentUser, storeId: string): void {
  if (!mongoose.isValidObjectId(storeId)) {
    throw new AuthError(403, "Loja inválida.");
  }
  if (!canAccessStore(user.storeAccess, storeId)) {
    throw new AuthError(403, "Sem acesso a esta loja.");
  }
}

/** Confirma que a loja pertence ao workspace activo da sessão. */
export async function requireWorkspaceStore(
  user: CurrentUser,
  storeId: string,
  opts?: { activeOnly?: boolean },
): Promise<void> {
  requireStoreAccess(user, storeId);
  const store = await findStoreForUser(user, storeId, "_id", opts);
  if (!store) {
    throw new AuthError(
      403,
      opts?.activeOnly
        ? "Loja não encontrada ou arquivada."
        : "Loja não encontrada neste workspace.",
    );
  }
}

/** Confirma membership activo no workspace indicado (não só o activo na sessão). */
export async function requireWorkspaceMembership(
  userId: string,
  workspaceId: string,
  roles?: readonly string[],
): Promise<void> {
  if (!mongoose.isValidObjectId(workspaceId) || !mongoose.isValidObjectId(userId)) {
    throw new AuthError(403, "Workspace inválido.");
  }
  await connectToDatabase();
  const { Membership } = await import("@/models/Membership");
  const filter: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(userId),
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    status: "active",
  };
  if (roles?.length) {
    filter.role = { $in: [...roles] };
  }
  const membership = await Membership.findOne(filter).select("_id").lean();
  if (!membership) {
    throw new AuthError(403, "Sem acesso a este workspace.");
  }
}

export function requireRole(
  user: CurrentUser,
  roles: readonly string[],
): void {
  if (!roles.includes(user.role)) {
    throw new AuthError(403, "Sem permissão para esta acção.");
  }
}

export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[auth]", error);
  return NextResponse.json({ error: "Erro interno." }, { status: 500 });
}
