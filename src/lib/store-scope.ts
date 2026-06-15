import "server-only";
import mongoose from "mongoose";
import type { CurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import {
  canAccessStore,
  storeAccessMongoFilter,
  type StoreAccess,
} from "@/lib/store-access";

type StoreQueryUser = Pick<CurrentUser, "workspaceId" | "storeAccess">;

/** Lojas visíveis em seletores, dashboard e métricas (exclui arquivadas). */
export const NON_ARCHIVED_STORE_FILTER = {
  status: { $ne: "archived" as const },
};

export function isArchivedStoreStatus(status: string | null | undefined): boolean {
  return status === "archived";
}

/** Query base para `Store.find` respeitando o acesso do utilizador. */
export function storeQueryForUser(
  user: StoreQueryUser,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const q: Record<string, unknown> = {
    workspaceId: user.workspaceId,
    deletedAt: null,
    ...extra,
  };
  const filter = storeAccessMongoFilter(user.storeAccess);
  if (filter) Object.assign(q, filter);
  return q;
}

/** Como `storeQueryForUser`, mas exclui lojas arquivadas (seletores e métricas). */
export function activeStoreQueryForUser(
  user: StoreQueryUser,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return storeQueryForUser(user, { ...NON_ARCHIVED_STORE_FILTER, ...extra });
}

export function assertStoreAccess(
  storeAccess: StoreAccess,
  storeId: string,
): void {
  if (!canAccessStore(storeAccess, storeId)) {
    throw new Error("Sem acesso a esta loja.");
  }
}

/**
 * Loja no workspace activo da sessão, só se o utilizador tiver acesso.
 * Devolve null se o id for inválido, a loja for de outro workspace ou estiver fora do scope.
 */
export async function findStoreForUser(
  user: StoreQueryUser,
  storeId: string,
  select?: string,
  opts?: { activeOnly?: boolean },
) {
  if (!user.workspaceId || !mongoose.isValidObjectId(storeId)) return null;
  if (!canAccessStore(user.storeAccess, storeId)) return null;

  await connectToDatabase();
  const q: Record<string, unknown> = {
    _id: storeId,
    workspaceId: user.workspaceId,
    deletedAt: null,
  };
  if (opts?.activeOnly) Object.assign(q, NON_ARCHIVED_STORE_FILTER);

  return Store.findOne(q).select(select ?? "_id").lean();
}

/** Como `findStoreForUser`, mas lança se a loja não existir ou não houver acesso. */
export async function requireStoreForUser(
  user: StoreQueryUser,
  storeId: string,
  select?: string,
) {
  const store = await findStoreForUser(user, storeId, select);
  if (!store) {
    throw new Error("Loja não encontrada ou sem acesso.");
  }
  return store;
}
