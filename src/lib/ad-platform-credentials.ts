import "server-only";
import mongoose, { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { AdPlatformCredential } from "@/models/AdPlatformCredential";
import {
  encryptAdCredentials,
  decryptAdCredentials,
  type GoogleCredentials,
} from "@/lib/ad-accounts";
import type { AdPlatform } from "@/lib/ad-spend-platforms";

export type WorkspaceGoogleLogin = {
  id: string;
  loginEmail: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listWorkspaceGoogleLogins(
  workspaceId: string,
): Promise<WorkspaceGoogleLogin[]> {
  await connectToDatabase();
  const rows = await AdPlatformCredential.find({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    platform: "google",
    deletedAt: null,
  })
    .sort({ loginEmail: 1 })
    .lean();

  return rows.map((r) => ({
    id: String(r._id),
    loginEmail: r.loginEmail,
  }));
}

export async function upsertWorkspaceGoogleCredential(
  workspaceId: Types.ObjectId | string,
  loginEmail: string,
  refreshToken: string,
): Promise<WorkspaceGoogleLogin> {
  await connectToDatabase();
  const email = normalizeEmail(loginEmail || "google@sem-email");
  const credentials = encryptAdCredentials({ refreshToken: refreshToken.trim() });

  const row = await AdPlatformCredential.findOneAndUpdate(
    {
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      platform: "google",
      loginEmail: email,
      deletedAt: null,
    },
    {
      $set: {
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        platform: "google",
        loginEmail: email,
        credentials,
      },
    },
    { upsert: true, new: true },
  ).lean();

  if (!row) {
    throw new Error("Não foi possível guardar o login Google.");
  }

  return { id: String(row._id), loginEmail: row.loginEmail };
}

export async function getWorkspaceGoogleRefreshToken(
  workspaceId: string,
  credentialId: string,
): Promise<{ refreshToken: string; loginEmail: string } | null> {
  if (!mongoose.isValidObjectId(credentialId)) return null;
  await connectToDatabase();
  const row = await AdPlatformCredential.findOne({
    _id: new mongoose.Types.ObjectId(credentialId),
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    platform: "google",
    deletedAt: null,
  }).lean();

  if (!row) return null;
  const creds = decryptAdCredentials<GoogleCredentials>(row.credentials);
  if (!creds.refreshToken?.trim()) return null;
  return {
    refreshToken: creds.refreshToken.trim(),
    loginEmail: row.loginEmail,
  };
}

export async function saveWorkspaceGoogleCredentialManual(
  workspaceId: string,
  loginEmail: string,
  refreshToken: string,
): Promise<WorkspaceGoogleLogin> {
  const trimmed = refreshToken.trim();
  if (trimmed.length < 10) {
    throw new Error("Refresh token inválido.");
  }
  const email = loginEmail.trim();
  if (!email.includes("@")) {
    throw new Error("Indica o email do Gmail usado no Google Ads.");
  }
  return upsertWorkspaceGoogleCredential(workspaceId, email, trimmed);
}

export async function softDeleteWorkspaceCredential(
  workspaceId: string,
  credentialId: string,
  platform: AdPlatform,
): Promise<boolean> {
  if (!mongoose.isValidObjectId(credentialId)) return false;
  await connectToDatabase();
  const res = await AdPlatformCredential.updateOne(
    {
      _id: new mongoose.Types.ObjectId(credentialId),
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      platform,
      deletedAt: null,
    },
    { $set: { deletedAt: new Date() } },
  );
  return res.modifiedCount > 0;
}
