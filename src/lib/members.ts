import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Membership } from "@/models/Membership";
import { User } from "@/models/User";
import { Store } from "@/models/Store";
import {
  normalizeStoreAccess,
  storeAccessLabel,
  type StoreAccess,
} from "@/lib/store-access";

export type WorkspaceMemberView = {
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  storeAccess: StoreAccess;
  storeAccessLabel: string;
  isSelf: boolean;
};

export async function listWorkspaceMembers(
  workspaceId: string,
  currentUserId: string,
): Promise<WorkspaceMemberView[]> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(workspaceId);

  const memberships = await Membership.find({
    workspaceId: wsId,
    status: "active",
  })
    .sort({ role: -1, createdAt: 1 })
    .lean();

  if (!memberships.length) return [];

  const userIds = memberships.map((m) => m.userId);
  const users = await User.find({ _id: { $in: userIds } })
    .select("name email username")
    .lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const storeCount = await Store.countDocuments({
    workspaceId: wsId,
    deletedAt: null,
  });

  return memberships.map((m) => {
    const u = userById.get(String(m.userId));
    const userId = String(m.userId);
    const storeAccess = normalizeStoreAccess(m.storeAccess);
    return {
      membershipId: String(m._id),
      userId,
      name: u?.name ?? "—",
      email: u?.email ?? null,
      username: u?.username ?? null,
      role: m.role,
      storeAccess,
      storeAccessLabel: storeAccessLabel(storeAccess, storeCount),
      isSelf: userId === currentUserId,
    };
  });
}
