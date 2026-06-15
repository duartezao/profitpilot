import "server-only";
import mongoose, { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { AdAccount } from "@/models/AdAccount";
import type { AdPlatform } from "@/lib/ad-spend-platforms";
import { AD_PLATFORM_LABELS } from "@/lib/ad-spend-platforms";

export type AdAccountRow = {
  id: string;
  platform: AdPlatform;
  platformLabel: string;
  externalAccountId: string;
  accountName: string;
  allocation: number;
  status: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

export type MetaCredentials = { accessToken: string };
export type GoogleCredentials = { refreshToken: string };
export type TiktokCredentials = { accessToken: string };

export type AdAccountCredentials =
  | MetaCredentials
  | GoogleCredentials
  | TiktokCredentials;

export function credentialTokenForPlatform(
  platform: AdPlatform,
  creds: AdAccountCredentials,
): string {
  if (platform === "google") {
    return (creds as GoogleCredentials).refreshToken;
  }
  return (creds as MetaCredentials | TiktokCredentials).accessToken;
}

export function encryptAdCredentials(payload: Record<string, string>): string {
  return encrypt(JSON.stringify(payload));
}

export function decryptAdCredentials<T extends Record<string, string>>(
  blob: string,
): T {
  return JSON.parse(decrypt(blob)) as T;
}

export async function listAdAccountsForStore(
  workspaceId: string,
  storeId: string,
): Promise<AdAccountRow[]> {
  await connectToDatabase();
  const rows = await AdAccount.find({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    storeId: new mongoose.Types.ObjectId(storeId),
    deletedAt: null,
  })
    .sort({ platform: 1, accountName: 1 })
    .lean();

  return rows.map((r) => ({
    id: String(r._id),
    platform: r.platform as AdPlatform,
    platformLabel: AD_PLATFORM_LABELS[r.platform as AdPlatform] ?? r.platform,
    externalAccountId: r.externalAccountId,
    accountName: r.accountName ?? "",
    allocation: r.allocation ?? 100,
    status: r.status ?? "active",
    lastSyncAt: r.lastSyncAt ? r.lastSyncAt.toISOString() : null,
    lastSyncError: r.lastSyncError ?? null,
  }));
}

export async function createAdAccount(opts: {
  workspaceId: Types.ObjectId;
  storeId: Types.ObjectId;
  platform: AdPlatform;
  externalAccountId: string;
  accountName?: string;
  credentials: AdAccountCredentials;
  allocation?: number;
}): Promise<string> {
  await connectToDatabase();
  const credentials = encryptAdCredentials(
    opts.credentials as unknown as Record<string, string>,
  );
  const doc = await AdAccount.create({
    workspaceId: opts.workspaceId,
    storeId: opts.storeId,
    platform: opts.platform,
    externalAccountId: opts.externalAccountId.trim(),
    accountName: opts.accountName?.trim() ?? "",
    credentials,
    allocation: opts.allocation ?? 100,
    status: "active",
  });
  return String(doc._id);
}

export async function softDeleteAdAccount(
  workspaceId: string,
  accountId: string,
): Promise<boolean> {
  await connectToDatabase();
  const res = await AdAccount.updateOne(
    {
      _id: accountId,
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      deletedAt: null,
    },
    { $set: { deletedAt: new Date(), status: "disconnected" } },
  );
  return res.modifiedCount > 0;
}

export async function loadActiveAdAccounts(storeId: Types.ObjectId) {
  await connectToDatabase();
  return AdAccount.find({
    storeId,
    deletedAt: null,
    status: "active",
  }).lean();
}

export async function markAdAccountSync(
  accountId: Types.ObjectId,
  ok: boolean,
  error?: string | null,
) {
  await AdAccount.updateOne(
    { _id: accountId },
    {
      $set: {
        lastSyncAt: new Date(),
        lastSyncError: ok ? null : (error ?? "Erro desconhecido"),
        status: ok ? "active" : "error",
      },
    },
  );
}
