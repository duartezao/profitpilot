import "server-only";
import mongoose from "mongoose";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { connectToDatabase } from "@/lib/db";
import { Workspace } from "@/models/Workspace";
import { Store } from "@/models/Store";
import { Membership } from "@/models/Membership";
import { Invitation } from "@/models/Invitation";
import { Session } from "@/models/Session";

const SESSION_COOKIE = "pp_session";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type OwnedWorkspaceRow = {
  id: string;
  name: string;
  storeCount: number;
};

export async function listOwnedWorkspacesForUser(
  userId: string,
): Promise<OwnedWorkspaceRow[]> {
  await connectToDatabase();
  const memberships = await Membership.find({
    userId,
    role: "owner",
    status: "active",
  })
    .sort({ createdAt: 1 })
    .lean();

  if (!memberships.length) return [];

  const workspaceIds = memberships.map((m) => m.workspaceId);
  const workspaces = await Workspace.find({ _id: { $in: workspaceIds } })
    .select("name")
    .lean();
  const wsMap = new Map(workspaces.map((w) => [String(w._id), w]));

  const storeCounts = await Store.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
    {
      $match: {
        workspaceId: { $in: workspaceIds },
        deletedAt: null,
      },
    },
    { $group: { _id: "$workspaceId", n: { $sum: 1 } } },
  ]);
  const countByWs = new Map(storeCounts.map((r) => [String(r._id), r.n]));

  const rows: OwnedWorkspaceRow[] = [];
  for (const m of memberships) {
    const ws = wsMap.get(String(m.workspaceId));
    if (!ws) continue;
    rows.push({
      id: String(m.workspaceId),
      name: ws.name,
      storeCount: countByWs.get(String(m.workspaceId)) ?? 0,
    });
  }
  return rows;
}

export async function renameOwnedWorkspace(
  userId: string,
  workspaceId: string,
  name: string,
): Promise<void> {
  await connectToDatabase();
  const wsOid = new mongoose.Types.ObjectId(workspaceId);
  const membership = await Membership.findOne({
    userId,
    workspaceId: wsOid,
    role: "owner",
    status: "active",
  });
  if (!membership) {
    throw new Error("Sem permissão para editar este workspace.");
  }

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Dá um nome ao workspace.");

  await Workspace.updateOne({ _id: wsOid }, { $set: { name: trimmed } });
}

export type DeleteWorkspaceConfirmation = {
  /** Obrigatório quando há lojas — tem de coincidir com o nome. */
  confirmName?: string;
  /** Obrigatório quando há lojas. */
  acknowledgeDataLoss?: boolean;
};

export async function deleteOwnedWorkspace(
  userId: string,
  workspaceId: string,
  confirmation: DeleteWorkspaceConfirmation = {},
): Promise<{ switchedToWorkspaceId: string | null }> {
  await connectToDatabase();
  const userOid = new mongoose.Types.ObjectId(userId);
  const wsOid = new mongoose.Types.ObjectId(workspaceId);

  const membership = await Membership.findOne({
    userId: userOid,
    workspaceId: wsOid,
    role: "owner",
    status: "active",
  });
  if (!membership) {
    throw new Error("Sem permissão para apagar este workspace.");
  }

  const totalMemberships = await Membership.countDocuments({
    userId: userOid,
    status: "active",
  });
  if (totalMemberships <= 1) {
    throw new Error(
      "Não podes apagar o único workspace a que tens acesso. Cria outro primeiro.",
    );
  }

  const workspace = await Workspace.findById(wsOid).select("name").lean();
  if (!workspace) throw new Error("Workspace não encontrado.");

  const storeCount = await Store.countDocuments({
    workspaceId: wsOid,
    deletedAt: null,
  });

  if (storeCount > 0) {
    if (!confirmation.acknowledgeDataLoss) {
      throw new Error("Confirma que compreendes a remoção das lojas e dados.");
    }
    if ((confirmation.confirmName ?? "").trim() !== workspace.name) {
      throw new Error("O nome escrito não coincide com o workspace.");
    }
  }

  const now = new Date();
  if (storeCount > 0) {
    await Store.updateMany(
      { workspaceId: wsOid, deletedAt: null },
      { $set: { deletedAt: now, status: "archived" } },
    );
  }

  await Membership.updateMany(
    { workspaceId: wsOid },
    { $set: { status: "revoked" } },
  );
  await Invitation.updateMany(
    { workspaceId: wsOid, status: "pending" },
    { $set: { status: "revoked" } },
  );
  await Workspace.deleteOne({ _id: wsOid });

  const remaining = await Membership.find({
    userId: userOid,
    status: "active",
  })
    .sort({ createdAt: 1 })
    .lean();

  const fallbackId =
    remaining.length > 0 ? String(remaining[0].workspaceId) : null;

  await Session.updateMany(
    { userId: userOid, activeWorkspaceId: wsOid },
    fallbackId
      ? { $set: { activeWorkspaceId: new mongoose.Types.ObjectId(fallbackId) } }
      : { $unset: { activeWorkspaceId: "" } },
  );

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token && fallbackId) {
    const session = await Session.findOne({
      tokenHash: hashToken(token),
      expiresAt: { $gt: new Date() },
    });
    if (session && String(session.activeWorkspaceId) === workspaceId) {
      await Session.updateOne(
        { _id: session._id },
        { $set: { activeWorkspaceId: new mongoose.Types.ObjectId(fallbackId) } },
      );
    }
  }

  return { switchedToWorkspaceId: fallbackId };
}
