import "server-only";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Invitation } from "@/models/Invitation";
import { Membership } from "@/models/Membership";
import { Workspace } from "@/models/Workspace";
import { User } from "@/models/User";
import { Store } from "@/models/Store";
import {
  normalizeStoreAccess,
  storeAccessLabel,
  type StoreAccess,
} from "@/lib/store-access";
import { canAssignRole } from "@/lib/rbac";
import {
  isEmailLike,
  normalizeUsername,
  validateEmail,
  validateUsername,
} from "@/lib/username";
import type {
  PendingInvitationView,
  SentInvitationView,
} from "@/lib/invitation-types";

export type { PendingInvitationView, SentInvitationView };

const INVITE_TTL_DAYS = 14;

export type InviteTarget =
  | { type: "email"; email: string }
  | { type: "username"; username: string; userId: string };

export type InviteUserRef = {
  id: string;
  email: string | null;
  username: string | null;
};

function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function inviteeOrFilter(
  email: string | null | undefined,
  username: string | null | undefined,
): Record<string, string>[] {
  const or: Record<string, string>[] = [];
  const e = email?.trim().toLowerCase();
  const u = username?.trim() ? normalizeUsername(username) : null;
  if (e) or.push({ email: e });
  if (u) or.push({ username: u });
  return or;
}

function invitationMatchesUser(
  inv: {
    email?: string | null;
    username?: string | null;
    invitedUserId?: mongoose.Types.ObjectId | null;
  },
  user: Pick<InviteUserRef, "id" | "email" | "username">,
): boolean {
  if (
    inv.invitedUserId &&
    user.id &&
    String(inv.invitedUserId) === user.id
  ) {
    return true;
  }
  const e = user.email?.trim().toLowerCase();
  const u = user.username ? normalizeUsername(user.username) : null;
  if (inv.email && e && inv.email === e) return true;
  if (inv.username && u && inv.username === u) return true;
  return false;
}

function inviteeLabel(inv: {
  email?: string | null;
  username?: string | null;
}): string {
  if (inv.username) return `@${inv.username}`;
  if (inv.email) return inv.email;
  return "—";
}

/** Resolve email ou @utilizador para o alvo do convite. */
export async function resolveInviteIdentifier(
  identifier: string,
): Promise<{ ok: true; target: InviteTarget } | { ok: false; error: string }> {
  const raw = identifier.trim();
  if (!raw) {
    return { ok: false, error: "Preenche o email ou utilizador." };
  }

  if (isEmailLike(raw)) {
    const email = raw.toLowerCase();
    const emailError = validateEmail(email);
    if (emailError) return { ok: false, error: emailError };
    return { ok: true, target: { type: "email", email } };
  }

  const username = normalizeUsername(raw);
  const usernameError = validateUsername(username);
  if (usernameError) return { ok: false, error: usernameError };

  await connectToDatabase();
  const user = await User.findOne({ username }).select("_id").lean();
  if (!user) {
    return {
      ok: false,
      error:
        "Utilizador não encontrado. Para convidar alguém sem conta, usa o email.",
    };
  }

  return {
    ok: true,
    target: { type: "username", username, userId: String(user._id) },
  };
}

async function workspaceStoreCount(workspaceId: mongoose.Types.ObjectId) {
  return Store.countDocuments({ workspaceId, deletedAt: null });
}

async function expireStaleInvites(filter: Record<string, unknown>) {
  const now = new Date();
  await Invitation.updateMany(
    { ...filter, status: "pending", expiresAt: { $lte: now } },
    { $set: { status: "expired" } },
  );
}

export async function listPendingInvitationsForUser(
  user: Pick<InviteUserRef, "email" | "username"> & { id?: string },
): Promise<PendingInvitationView[]> {
  await connectToDatabase();
  const or: Record<string, unknown>[] = inviteeOrFilter(
    user.email,
    user.username,
  );
  if (user.id && mongoose.isValidObjectId(user.id)) {
    or.push({ invitedUserId: new mongoose.Types.ObjectId(user.id) });
  }
  if (!or.length) return [];

  const now = new Date();
  await expireStaleInvites({ $or: or });

  const invites = await Invitation.find({
    status: "pending",
    expiresAt: { $gt: now },
    $or: or,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!invites.length) return [];

  const workspaceIds = invites.map((i) => i.workspaceId);
  const inviterIds = invites.map((i) => i.invitedBy);

  const [workspaces, inviters] = await Promise.all([
    Workspace.find({ _id: { $in: workspaceIds } }).lean(),
    User.find({ _id: { $in: inviterIds } }).select("name").lean(),
  ]);

  const wsById = new Map(workspaces.map((w) => [String(w._id), w]));
  const userById = new Map(inviters.map((u) => [String(u._id), u]));

  const views: PendingInvitationView[] = [];
  for (const inv of invites) {
    const ws = wsById.get(String(inv.workspaceId));
    if (!ws) continue;
    const storeCount = await workspaceStoreCount(inv.workspaceId);
    const access = normalizeStoreAccess(inv.storeAccess);
    views.push({
      id: String(inv._id),
      workspaceId: String(inv.workspaceId),
      workspaceName: ws.name,
      role: inv.role,
      storeAccessLabel: storeAccessLabel(access, storeCount),
      invitedByName: userById.get(String(inv.invitedBy))?.name ?? "—",
      expiresAt: new Date(inv.expiresAt).toISOString(),
      createdAt: new Date(inv.createdAt).toISOString(),
    });
  }
  return views;
}

/** @deprecated Usar listPendingInvitationsForUser */
export async function listPendingInvitationsForEmail(email: string) {
  return listPendingInvitationsForUser({ email, username: null });
}

export async function listSentInvitationsForWorkspace(
  workspaceId: string,
): Promise<SentInvitationView[]> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const now = new Date();

  const invites = await Invitation.find({
    workspaceId: wsId,
    status: "pending",
    expiresAt: { $gt: now },
  })
    .sort({ createdAt: -1 })
    .lean();

  const storeCount = await workspaceStoreCount(wsId);

  return invites.map((inv) => {
    const access = normalizeStoreAccess(inv.storeAccess);
    return {
      id: String(inv._id),
      inviteeLabel: inviteeLabel(inv),
      role: inv.role,
      storeAccessLabel: storeAccessLabel(access, storeCount),
      expiresAt: new Date(inv.expiresAt).toISOString(),
      createdAt: new Date(inv.createdAt).toISOString(),
    };
  });
}

export async function createWorkspaceInvitation(input: {
  workspaceId: string;
  invitedByUserId: string;
  actorRole: string;
  target: InviteTarget;
  role: "admin" | "editor" | "viewer";
  storeAccess: StoreAccess;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const assign = canAssignRole(input.actorRole, input.role);
  if (!assign.ok) return assign;

  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(input.workspaceId);
  const { target } = input;

  if (input.storeAccess !== "all" && input.storeAccess.length === 0) {
    return { ok: false, error: "Selecciona pelo menos uma loja ou «todas»." };
  }

  if (input.storeAccess !== "all") {
    const validCount = await Store.countDocuments({
      _id: {
        $in: input.storeAccess.map((id) => new mongoose.Types.ObjectId(id)),
      },
      workspaceId: wsId,
      deletedAt: null,
    });
    if (validCount !== input.storeAccess.length) {
      return { ok: false, error: "Uma ou mais lojas seleccionadas são inválidas." };
    }
  }

  let email: string | undefined;
  let username: string | undefined;
  let inviteeUserId: mongoose.Types.ObjectId | undefined;

  if (target.type === "email") {
    email = target.email;
    const existingUser = await User.findOne({ email })
      .select("username email")
      .lean();
    if (existingUser) {
      inviteeUserId = existingUser._id;
      if (existingUser.username) {
        username = normalizeUsername(existingUser.username);
      }
    }
  } else {
    username = normalizeUsername(target.username);
    inviteeUserId = new mongoose.Types.ObjectId(target.userId);
    const existingUser = await User.findById(target.userId)
      .select("email username")
      .lean();
    if (existingUser?.email) {
      email = existingUser.email.trim().toLowerCase();
    }
  }

  if (inviteeUserId) {
    const member = await Membership.findOne({
      userId: inviteeUserId,
      workspaceId: wsId,
      status: "active",
    }).lean();
    if (member) {
      return { ok: false, error: "Esta pessoa já é membro do workspace." };
    }
  }

  const dupOr: Record<string, string>[] = [];
  if (email) dupOr.push({ email });
  if (username) dupOr.push({ username });

  const pending = await Invitation.findOne({
    workspaceId: wsId,
    status: "pending",
    expiresAt: { $gt: new Date() },
    $or: dupOr,
  });
  if (pending) {
    return {
      ok: false,
      error: "Já existe um convite pendente para esta pessoa.",
    };
  }

  await Invitation.create({
    workspaceId: wsId,
    ...(email ? { email } : {}),
    ...(username ? { username } : {}),
    ...(inviteeUserId ? { invitedUserId: inviteeUserId } : {}),
    role: input.role,
    storeAccess: input.storeAccess,
    token: newToken(),
    status: "pending",
    invitedBy: new mongoose.Types.ObjectId(input.invitedByUserId),
    expiresAt: inviteExpiry(),
  });

  return { ok: true };
}

export async function acceptInvitation(
  invitationId: string,
  user: InviteUserRef,
): Promise<{ ok: true; workspaceId: string } | { ok: false; error: string }> {
  await connectToDatabase();
  const inv = await Invitation.findById(invitationId);
  if (!inv || inv.status !== "pending") {
    return { ok: false, error: "Convite inválido ou já tratado." };
  }
  if (inv.expiresAt <= new Date()) {
    inv.status = "expired";
    await inv.save();
    return { ok: false, error: "Este convite expirou." };
  }
  if (!invitationMatchesUser(inv, user)) {
    return { ok: false, error: "Este convite não é para a tua conta." };
  }

  const userOid = new mongoose.Types.ObjectId(user.id);
  const storeAccess = normalizeStoreAccess(inv.storeAccess);
  const existing = await Membership.findOne({
    userId: userOid,
    workspaceId: inv.workspaceId,
  });

  if (existing?.status === "active") {
    inv.status = "accepted";
    await inv.save();
    return { ok: true, workspaceId: String(inv.workspaceId) };
  }

  if (existing) {
    await Membership.updateOne(
      { _id: existing._id },
      {
        $set: {
          role: inv.role,
          storeAccess,
          status: "active",
        },
        $unset: { expiresAt: "" },
      },
    );
  } else {
    await Membership.create({
      userId: userOid,
      workspaceId: inv.workspaceId,
      role: inv.role,
      storeAccess,
      status: "active",
    });
  }

  inv.status = "accepted";
  await inv.save();

  return { ok: true, workspaceId: String(inv.workspaceId) };
}

export async function declineInvitation(
  invitationId: string,
  user: Pick<InviteUserRef, "id" | "email" | "username">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await connectToDatabase();
  const inv = await Invitation.findById(invitationId);
  if (!inv || inv.status !== "pending") {
    return { ok: false, error: "Convite inválido ou já tratado." };
  }
  if (!invitationMatchesUser(inv, user)) {
    return { ok: false, error: "Este convite não é para a tua conta." };
  }

  inv.status = "declined";
  await inv.save();
  return { ok: true };
}

export async function revokeInvitation(
  invitationId: string,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await connectToDatabase();
  const inv = await Invitation.findOne({
    _id: invitationId,
    workspaceId,
    status: "pending",
  });
  if (!inv) return { ok: false, error: "Convite não encontrado." };

  inv.status = "revoked";
  await inv.save();
  return { ok: true };
}
