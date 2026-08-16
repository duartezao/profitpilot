import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { WorkspaceAccessCredential } from "@/models/WorkspaceAccessCredential";
import {
  ACCESS_VAULT_CATEGORIES,
  ACCESS_VAULT_CATEGORY_LABELS,
  type AccessVaultCategory,
  type AccessVaultRow,
} from "@/lib/access-vault";

export type { AccessVaultRow, AccessVaultCategory };

function encryptOptional(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return encrypt(trimmed);
}

function decryptOptional(payload: string | null | undefined): string {
  if (!payload?.trim()) return "";
  try {
    return decrypt(payload);
  } catch {
    return "";
  }
}

export async function listAccessVaultForWorkspace(
  workspaceId: string,
  storeNames: Map<string, string>,
): Promise<AccessVaultRow[]> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(workspaceId);

  const rows = await WorkspaceAccessCredential.find({
    workspaceId: wsId,
    deletedAt: null,
  })
    .sort({ category: 1, title: 1 })
    .lean();

  return rows.map((r) => {
    const storeId = r.storeId ? String(r.storeId) : null;
    return {
      id: String(r._id),
      category: r.category as AccessVaultCategory,
      categoryLabel:
        ACCESS_VAULT_CATEGORY_LABELS[r.category as AccessVaultCategory] ??
        r.category,
      title: r.title,
      username: decryptOptional(r.usernameEncrypted),
      password: decryptOptional(r.passwordEncrypted),
      url: r.url?.trim() ?? "",
      notes: decryptOptional(r.notesEncrypted),
      storeId,
      storeName: storeId ? (storeNames.get(storeId) ?? null) : null,
      updatedAt: r.updatedAt
        ? new Date(r.updatedAt).toISOString()
        : new Date().toISOString(),
    };
  });
}

export type AccessVaultInput = {
  category: AccessVaultCategory;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  storeId: string | null;
};

export function parseAccessVaultCategory(
  raw: string,
): AccessVaultCategory | null {
  return ACCESS_VAULT_CATEGORIES.includes(raw as AccessVaultCategory)
    ? (raw as AccessVaultCategory)
    : null;
}

export async function createAccessVaultEntry(
  workspaceId: string,
  userId: string,
  input: AccessVaultInput,
): Promise<void> {
  await connectToDatabase();
  await WorkspaceAccessCredential.create({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    storeId: input.storeId
      ? new mongoose.Types.ObjectId(input.storeId)
      : null,
    category: input.category,
    title: input.title.trim(),
    usernameEncrypted: encryptOptional(input.username),
    passwordEncrypted: encrypt(input.password.trim()),
    url: input.url.trim(),
    notesEncrypted: encryptOptional(input.notes),
    createdBy: new mongoose.Types.ObjectId(userId),
    updatedBy: new mongoose.Types.ObjectId(userId),
  });
}

export async function updateAccessVaultEntry(
  workspaceId: string,
  entryId: string,
  userId: string,
  input: AccessVaultInput,
): Promise<boolean> {
  await connectToDatabase();
  const res = await WorkspaceAccessCredential.updateOne(
    {
      _id: entryId,
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      deletedAt: null,
    },
    {
      $set: {
        storeId: input.storeId
          ? new mongoose.Types.ObjectId(input.storeId)
          : null,
        category: input.category,
        title: input.title.trim(),
        usernameEncrypted: encryptOptional(input.username),
        passwordEncrypted: encrypt(input.password.trim()),
        url: input.url.trim(),
        notesEncrypted: encryptOptional(input.notes),
        updatedBy: new mongoose.Types.ObjectId(userId),
      },
    },
  );
  return res.matchedCount > 0;
}

export async function softDeleteAccessVaultEntry(
  workspaceId: string,
  entryId: string,
): Promise<boolean> {
  await connectToDatabase();
  const res = await WorkspaceAccessCredential.updateOne(
    {
      _id: entryId,
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      deletedAt: null,
    },
    { $set: { deletedAt: new Date() } },
  );
  return res.matchedCount > 0;
}
