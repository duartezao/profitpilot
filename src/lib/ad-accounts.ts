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
  apiExtraFeeFixed: number;
  apiAgencyFeePercent: number;
  linkedLoginEmail: string;
  status: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

export type MetaCredentials = { accessToken: string };
export type GoogleCredentials = {
  refreshToken: string;
  /** MCC / gestor — obrigatório para contas convidadas via MCC. */
  loginCustomerId?: string;
};
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

export function googleLoginCustomerIdFromCreds(
  creds: AdAccountCredentials,
): string | undefined {
  const id = (creds as GoogleCredentials).loginCustomerId?.trim();
  return id || undefined;
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
    apiExtraFeeFixed: r.apiExtraFeeFixed ?? 0,
    apiAgencyFeePercent: r.apiAgencyFeePercent ?? 0,
    linkedLoginEmail: r.linkedLoginEmail?.trim() ?? "",
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
  apiExtraFeeFixed?: number;
  apiAgencyFeePercent?: number;
  linkedLoginEmail?: string;
  replaceOtherOnPlatform?: boolean;
}): Promise<string> {
  await connectToDatabase();

  if (opts.replaceOtherOnPlatform !== false) {
    await disconnectPlatformAccounts(opts.storeId, opts.platform, {
      exceptExternalId: opts.externalAccountId.trim(),
    });
  }

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
    apiExtraFeeFixed: opts.apiExtraFeeFixed ?? 0,
    apiAgencyFeePercent: opts.apiAgencyFeePercent ?? 0,
    linkedLoginEmail: opts.linkedLoginEmail?.trim() ?? "",
    status: "active",
  });
  return String(doc._id);
}

/** Desliga outras contas da mesma plataforma (histórico de gasto manual mantém-se). */
export async function disconnectPlatformAccounts(
  storeId: Types.ObjectId,
  platform: AdPlatform,
  options?: { exceptExternalId?: string },
): Promise<number> {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    storeId,
    platform,
    deletedAt: null,
  };
  if (options?.exceptExternalId) {
    filter.externalAccountId = { $ne: options.exceptExternalId.trim() };
  }
  const res = await AdAccount.updateMany(filter, {
    $set: { deletedAt: new Date(), status: "disconnected" },
  });
  return res.modifiedCount;
}

export async function updateAdAccountApiFees(
  workspaceId: string,
  accountId: string,
  fees: { apiExtraFeeFixed: number; apiAgencyFeePercent: number },
): Promise<boolean> {
  await connectToDatabase();
  const res = await AdAccount.updateOne(
    {
      _id: accountId,
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      deletedAt: null,
    },
    {
      $set: {
        apiExtraFeeFixed: fees.apiExtraFeeFixed,
        apiAgencyFeePercent: fees.apiAgencyFeePercent,
      },
    },
  );
  return res.modifiedCount > 0;
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
  })
    .sort({ createdAt: -1 })
    .lean();
}

export type ActiveAdAccountDoc = Awaited<
  ReturnType<typeof loadActiveAdAccounts>
>[number];

/** Uma conta por plataforma para sync — a mais recente ligada ganha. */
export function pickSyncAdAccountPerPlatform(
  accounts: ActiveAdAccountDoc[],
): Map<AdPlatform, ActiveAdAccountDoc> {
  const map = new Map<AdPlatform, ActiveAdAccountDoc>();
  for (const acc of accounts) {
    const platform = acc.platform as AdPlatform;
    const prev = map.get(platform);
    if (!prev) {
      map.set(platform, acc);
      continue;
    }
    const prevTs = prev.createdAt?.getTime() ?? 0;
    const accTs = acc.createdAt?.getTime() ?? 0;
    if (accTs >= prevTs) map.set(platform, acc);
  }
  return map;
}

export async function loadSyncAdAccountsForStore(
  storeId: Types.ObjectId,
): Promise<ActiveAdAccountDoc[]> {
  const accounts = await loadActiveAdAccounts(storeId);
  return [...pickSyncAdAccountPerPlatform(accounts).values()];
}

export async function loadActiveAdAccountIdsForStore(
  storeId: string | Types.ObjectId,
): Promise<string[]> {
  const oid =
    typeof storeId === "string"
      ? new mongoose.Types.ObjectId(storeId)
      : storeId;
  const accounts = await loadSyncAdAccountsForStore(oid);
  return accounts.map((a) => String(a._id));
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
