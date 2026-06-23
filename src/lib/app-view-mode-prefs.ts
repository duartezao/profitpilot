import "server-only";
import mongoose from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { Membership } from "@/models/Membership";
import {
  DEFAULT_APP_VIEW_MODE,
  normalizeAppViewMode,
  type AppViewMode,
} from "@/lib/app-view-mode";

const modeSchema = z.enum(["financial", "operations"]);

export async function getAppViewModeForUser(
  userId: string,
  workspaceId: string,
): Promise<AppViewMode> {
  await connectToDatabase();
  const membership = await Membership.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    status: "active",
  })
    .select("appViewMode")
    .lean();

  return normalizeAppViewMode(membership?.appViewMode as string | undefined);
}

export async function saveAppViewModeForUser(
  userId: string,
  workspaceId: string,
  mode: AppViewMode,
): Promise<AppViewMode> {
  const parsed = modeSchema.safeParse(normalizeAppViewMode(mode));
  if (!parsed.success) {
    throw new Error("Modo de vista inválido.");
  }

  await connectToDatabase();
  const result = await Membership.updateOne(
    {
      userId: new mongoose.Types.ObjectId(userId),
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      status: "active",
    },
    { $set: { appViewMode: parsed.data } },
  );

  if (result.matchedCount === 0) {
    throw new Error("Sem acesso a este workspace.");
  }

  return parsed.data;
}

export { DEFAULT_APP_VIEW_MODE };
