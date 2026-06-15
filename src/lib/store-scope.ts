import "server-only";
import type { CurrentUser } from "@/lib/auth";
import {
  canAccessStore,
  storeAccessMongoFilter,
  type StoreAccess,
} from "@/lib/store-access";

type StoreQueryUser = Pick<CurrentUser, "workspaceId" | "storeAccess">;

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

export function assertStoreAccess(
  storeAccess: StoreAccess,
  storeId: string,
): void {
  if (!canAccessStore(storeAccess, storeId)) {
    throw new Error("Sem acesso a esta loja.");
  }
}
