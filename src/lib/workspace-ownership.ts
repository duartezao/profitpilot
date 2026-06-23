import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Workspace } from "@/models/Workspace";
import { Membership } from "@/models/Membership";
import { User } from "@/models/User";
import type { WorkspaceOwnerView } from "@/lib/members";

export type { WorkspaceOwnerView };

/** O proprietário real do workspace (`Workspace.ownerId`). */
export async function isWorkspaceOwner(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  if (!userId || !workspaceId) return false;
  await connectToDatabase();
  const ws = await Workspace.findById(workspaceId).select("ownerId").lean();
  return Boolean(ws && String(ws.ownerId) === userId);
}

export function effectiveWorkspaceRole(
  membershipRole: string,
  userIsWorkspaceOwner: boolean,
): string {
  return userIsWorkspaceOwner ? "owner" : membershipRole;
}

/** Garante que só o `ownerId` tem papel owner na membership. */
export async function syncWorkspaceOwnerMembership(
  workspaceId: string,
): Promise<void> {
  await connectToDatabase();
  const wsOid = new mongoose.Types.ObjectId(workspaceId);
  const ws = await Workspace.findById(wsOid).select("ownerId").lean();
  if (!ws?.ownerId) return;

  await Membership.updateOne(
    { workspaceId: wsOid, userId: ws.ownerId, status: "active" },
    { $set: { role: "owner" } },
  );
  await Membership.updateMany(
    {
      workspaceId: wsOid,
      userId: { $ne: ws.ownerId },
      role: "owner",
      status: "active",
    },
    { $set: { role: "admin" } },
  );
}

export async function getWorkspaceOwnerView(
  workspaceId: string,
): Promise<WorkspaceOwnerView | null> {
  await connectToDatabase();
  const ws = await Workspace.findById(workspaceId).select("ownerId").lean();
  if (!ws?.ownerId) return null;

  const owner = await User.findById(ws.ownerId)
    .select("name email username")
    .lean();
  if (!owner) return null;

  return {
    userId: String(owner._id),
    name: owner.name,
    email: owner.email ?? null,
    username: owner.username ?? null,
  };
}
