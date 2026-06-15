import "server-only";
import mongoose from "mongoose";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { Workspace } from "@/models/Workspace";
import { Membership } from "@/models/Membership";
import { Session } from "@/models/Session";
import { normalizeStoreAccess, type StoreAccess } from "@/lib/store-access";

const SESSION_COOKIE = "pp_session";
// Validade da sessão na BD (renovada a cada visita — "sliding").
const SESSION_TTL_DAYS = 60;
// Cookie de longa duração; a verdade está na sessão da BD (que vai deslizando).
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
// Renova a sessão quando faltar menos de metade do tempo.
const SESSION_REFRESH_THRESHOLD_MS = (SESSION_TTL_DAYS / 2) * 24 * 60 * 60 * 1000;

function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argonVerify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Cria uma sessão para o utilizador e define o cookie httpOnly. */
export async function createSession(
  userId: string,
  activeWorkspaceId?: string,
) {
  await connectToDatabase();
  const token = randomBytes(32).toString("base64url");

  await Session.create({
    userId,
    tokenHash: hashToken(token),
    activeWorkspaceId: activeWorkspaceId
      ? activeWorkspaceId
      : undefined,
    expiresAt: sessionExpiry(),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

async function resolveMembership(
  userId: mongoose.Types.ObjectId,
  preferredWorkspaceId?: string | null,
) {
  const memberships = await Membership.find({
    userId,
    status: "active",
  }).sort({ createdAt: 1 });

  if (memberships.length === 0) return null;

  if (preferredWorkspaceId) {
    const match = memberships.find(
      (m) => String(m.workspaceId) === preferredWorkspaceId,
    );
    if (match) return match;
  }

  return memberships[0];
}

export type UserWorkspace = {
  id: string;
  name: string;
  role: string;
  isOwner: boolean;
};

/** Lista workspaces a que o utilizador tem acesso. */
export async function listUserWorkspaces(userId: string): Promise<UserWorkspace[]> {
  await connectToDatabase();
  const memberships = await Membership.find({
    userId,
    status: "active",
  }).lean();

  const workspaceIds = memberships.map((m) => m.workspaceId);
  const workspaces = await Workspace.find({ _id: { $in: workspaceIds } }).lean();
  const wsMap = new Map(workspaces.map((w) => [String(w._id), w]));

  const result: UserWorkspace[] = [];
  for (const m of memberships) {
    const ws = wsMap.get(String(m.workspaceId));
    if (!ws) continue;
    result.push({
      id: String(ws._id),
      name: ws.name,
      role: m.role,
      isOwner: m.role === "owner",
    });
  }
  return result;
}

/** Workspaces onde o utilizador pode gerir lojas (owner ou admin). */
export async function listManageableWorkspaces(
  userId: string,
): Promise<UserWorkspace[]> {
  const all = await listUserWorkspaces(userId);
  return all.filter((w) => w.role === "owner" || w.role === "admin");
}

/** Workspaces onde o utilizador pode adicionar lojas (owner, admin ou editor). */
export async function listStoreWritableWorkspaces(
  userId: string,
): Promise<UserWorkspace[]> {
  const all = await listUserWorkspaces(userId);
  return all.filter(
    (w) => w.role === "owner" || w.role === "admin" || w.role === "editor",
  );
}

/** Troca o workspace ativo na sessão atual. */
export async function switchWorkspace(workspaceId: string): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error("Não autenticado.");

  await connectToDatabase();
  const session = await Session.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) throw new Error("Sessão inválida.");

  const wsOid = new mongoose.Types.ObjectId(workspaceId);
  const membership = await Membership.findOne({
    userId: session.userId,
    workspaceId: wsOid,
    status: "active",
  });
  if (!membership) throw new Error("Sem acesso a este workspace.");

  // Atualização atómica — evita sobrescrever activeWorkspaceId num save concorrente.
  await Session.updateOne(
    { _id: session._id },
    { $set: { activeWorkspaceId: membership.workspaceId } },
  );
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  storeAccess: StoreAccess;
};

/** Devolve o utilizador da sessão atual, ou null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  await connectToDatabase();
  const session = await Session.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;

  // Sliding expiration: prolonga a sessão enquanto o utilizador a usa.
  if (
    session.expiresAt.getTime() - Date.now() <
    SESSION_REFRESH_THRESHOLD_MS
  ) {
    const expiresAt = sessionExpiry();
    await Session.updateOne({ _id: session._id }, { $set: { expiresAt } });
    session.expiresAt = expiresAt;
  }

  const user = await User.findById(session.userId);
  if (!user) return null;

  const membership = await resolveMembership(
    user._id,
    session.activeWorkspaceId ? String(session.activeWorkspaceId) : null,
  );

  // Persiste workspace ativo na sessão (sessões antigas sem o campo).
  if (membership && !session.activeWorkspaceId) {
    await Session.updateOne(
      { _id: session._id },
      { $set: { activeWorkspaceId: membership.workspaceId } },
    );
    session.activeWorkspaceId = membership.workspaceId;
  }

  const workspace = membership
    ? await Workspace.findById(membership.workspaceId)
    : null;

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    workspaceId: workspace ? String(workspace._id) : "",
    workspaceName: workspace?.name ?? "",
    role: membership?.role ?? "viewer",
    storeAccess: normalizeStoreAccess(membership?.storeAccess ?? "all"),
  };
}

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await connectToDatabase();
    await Session.deleteOne({ tokenHash: hashToken(token) });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Regista um utilizador, cria o workspace e a membership de owner. */
export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  workspaceName?: string;
}) {
  await connectToDatabase();
  const email = input.email.toLowerCase().trim();

  const existing = await User.findOne({ email });
  if (existing) {
    throw new Error("Já existe uma conta com este email.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await User.create({
    name: input.name.trim(),
    email,
    passwordHash,
  });

  const workspace = await Workspace.create({
    name: input.workspaceName?.trim() || `Workspace de ${input.name.trim()}`,
    ownerId: user._id,
  });

  await Membership.create({
    userId: user._id,
    workspaceId: workspace._id,
    role: "owner",
    storeAccess: "all",
  });

  await createSession(String(user._id), String(workspace._id));
  return { userId: String(user._id) };
}

/** Autentica um utilizador existente. */
export async function loginUser(input: { email: string; password: string }) {
  await connectToDatabase();
  const email = input.email.toLowerCase().trim();
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("Email ou password incorretos.");
  }
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    throw new Error("Email ou password incorretos.");
  }

  const membership = await Membership.findOne({
    userId: user._id,
    status: "active",
  }).sort({ createdAt: 1 });

  await createSession(
    String(user._id),
    membership ? String(membership.workspaceId) : undefined,
  );
  return { userId: String(user._id) };
}
