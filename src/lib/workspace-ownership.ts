import "server-only";
import { connectToDatabase } from "@/lib/db";
import { Workspace } from "@/models/Workspace";

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
