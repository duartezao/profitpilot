"use server";

import mongoose from "mongoose";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { assertStoreAccess } from "@/lib/store-scope";
import type { StoreAccess } from "@/lib/store-access";
import {
  ACCESS_VAULT_CATEGORIES,
} from "@/lib/access-vault";
import {
  createAccessVaultEntry,
  parseAccessVaultCategory,
  softDeleteAccessVaultEntry,
  updateAccessVaultEntry,
} from "@/lib/workspace-access-vault";

export type AccessVaultActionState = { ok?: boolean; error?: string };

const ROLES_EDIT = ["owner", "admin", "editor"];

const entrySchema = z.object({
  category: z.enum(ACCESS_VAULT_CATEGORIES),
  title: z
    .string()
    .trim()
    .min(2, "Indica um nome para este acesso (mín. 2 caracteres).")
    .max(120),
  username: z.string().trim().max(200).optional(),
  password: z
    .string()
    .trim()
    .min(1, "A palavra-passe é obrigatória.")
    .max(500),
  url: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  storeId: z.string().trim().optional(),
});

function parseEntryForm(formData: FormData) {
  const storeRaw = String(formData.get("storeId") ?? "").trim();
  return entrySchema.safeParse({
    category: String(formData.get("category") ?? ""),
    title: String(formData.get("title") ?? ""),
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    url: String(formData.get("url") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    storeId: storeRaw || undefined,
  });
}

async function resolveStoreId(
  workspaceId: string,
  storeAccess: StoreAccess,
  storeId: string | undefined,
): Promise<{ storeId: string | null } | { error: string }> {
  if (!storeId) return { storeId: null };
  if (!mongoose.isValidObjectId(storeId)) {
    return { error: "Loja inválida." };
  }
  try {
    assertStoreAccess(storeAccess, storeId);
  } catch {
    return { error: "Sem acesso a esta loja." };
  }
  await connectToDatabase();
  const store = await Store.findOne({
    _id: storeId,
    workspaceId,
    deletedAt: null,
  })
    .select("_id")
    .lean();
  if (!store) return { error: "Loja não encontrada." };
  return { storeId };
}

export async function addAccessVaultEntryAction(
  _prev: AccessVaultActionState,
  formData: FormData,
): Promise<AccessVaultActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para adicionar acessos." };
  }

  const parsed = parseEntryForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const storeRes = await resolveStoreId(
    user.workspaceId,
    user.storeAccess,
    d.storeId,
  );
  if ("error" in storeRes) return { error: storeRes.error };

  const category = parseAccessVaultCategory(d.category);
  if (!category) return { error: "Tipo de acesso inválido." };

  await createAccessVaultEntry(user.workspaceId, user.id, {
    category,
    title: d.title,
    username: d.username ?? "",
    password: d.password,
    url: d.url ?? "",
    notes: d.notes ?? "",
    storeId: storeRes.storeId,
  });

  revalidatePath("/definicoes");
  return { ok: true };
}

export async function updateAccessVaultEntryAction(
  _prev: AccessVaultActionState,
  formData: FormData,
): Promise<AccessVaultActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar acessos." };
  }

  const entryId = String(formData.get("entryId") ?? "");
  if (!mongoose.isValidObjectId(entryId)) {
    return { error: "Registo inválido." };
  }

  const parsed = parseEntryForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const storeRes = await resolveStoreId(
    user.workspaceId,
    user.storeAccess,
    d.storeId,
  );
  if ("error" in storeRes) return { error: storeRes.error };

  const category = parseAccessVaultCategory(d.category);
  if (!category) return { error: "Tipo de acesso inválido." };

  const ok = await updateAccessVaultEntry(
    user.workspaceId,
    entryId,
    user.id,
    {
      category,
      title: d.title,
      username: d.username ?? "",
      password: d.password,
      url: d.url ?? "",
      notes: d.notes ?? "",
      storeId: storeRes.storeId,
    },
  );
  if (!ok) return { error: "Registo não encontrado." };

  revalidatePath("/definicoes");
  return { ok: true };
}

export async function deleteAccessVaultEntryAction(
  _prev: AccessVaultActionState,
  formData: FormData,
): Promise<AccessVaultActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão." };
  }

  const entryId = String(formData.get("entryId") ?? "");
  if (!mongoose.isValidObjectId(entryId)) {
    return { error: "Registo inválido." };
  }

  const ok = await softDeleteAccessVaultEntry(user.workspaceId, entryId);
  if (!ok) return { error: "Registo não encontrado." };

  revalidatePath("/definicoes");
  return { ok: true };
}
