"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { ResearchItem } from "@/models/ResearchItem";
import { resolveResearchDate } from "@/lib/research";
import {
  normalizeResearchGender,
  normalizeResearchKind,
  normalizeResearchStatus,
} from "@/lib/research-types";

function canEditResearch(role: string): boolean {
  return roleRank(role) >= roleRank("editor");
}

const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => !v || /^https?:\/\//i.test(v) || v.startsWith("www."),
    "Link inválido (usa http/https).",
  );

const createSchema = z.object({
  kind: z.enum(["product", "collection"]),
  name: z.string().trim().min(1, "Nome obrigatório.").max(200),
  reach: z.number().min(0).nullable().optional(),
  activeDays: z.number().min(0).nullable().optional(),
  fbAdLink: optionalUrl.optional().default(""),
  storeLink: optionalUrl.optional().default(""),
  market: z.string().trim().max(80).optional().default(""),
  researchedAt: z.string().trim().optional().nullable(),
  gender: z.enum(["female", "male", "unisex", "unknown"]).optional(),
  notes: z.string().trim().max(4000).optional().default(""),
  angle: z.string().trim().max(300).optional().default(""),
  status: z
    .enum(["new", "shortlist", "testing", "winner", "rejected"])
    .optional(),
});

const updateSchema = createSchema.extend({
  id: z.string().min(1),
});

function normalizeLink(v?: string | null): string {
  const t = (v ?? "").trim();
  if (!t) return "";
  if (t.startsWith("www.")) return `https://${t}`;
  return t;
}

function parseOptionalNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export async function createResearchItemAction(
  input: z.infer<typeof createSchema>,
): Promise<{ ok?: boolean; error?: string; id?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditResearch(user.role)) {
    return { error: "Sem permissão para adicionar research." };
  }

  const parsed = createSchema.safeParse({
    ...input,
    reach: parseOptionalNumber(input.reach),
    activeDays: parseOptionalNumber(input.activeDays),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const data = parsed.data;
  await connectToDatabase();

  const doc = await ResearchItem.create({
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    kind: normalizeResearchKind(data.kind),
    name: data.name,
    reach: data.reach ?? null,
    activeDays: data.activeDays ?? null,
    fbAdLink: normalizeLink(data.fbAdLink),
    storeLink: normalizeLink(data.storeLink),
    market: data.market?.trim() ?? "",
    researchedAt: resolveResearchDate(data.researchedAt),
    gender: normalizeResearchGender(data.gender ?? "unknown"),
    notes: data.notes?.trim() ?? "",
    angle: data.angle?.trim() ?? "",
    status: normalizeResearchStatus(data.status ?? "new"),
    createdBy: new mongoose.Types.ObjectId(user.id),
  });

  revalidatePath("/pesquisa");
  return { ok: true, id: String(doc._id) };
}

export async function updateResearchItemAction(
  input: z.infer<typeof updateSchema>,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditResearch(user.role)) {
    return { error: "Sem permissão para editar research." };
  }

  const parsed = updateSchema.safeParse({
    ...input,
    reach: parseOptionalNumber(input.reach),
    activeDays: parseOptionalNumber(input.activeDays),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const data = parsed.data;
  await connectToDatabase();

  const result = await ResearchItem.updateOne(
    {
      _id: data.id,
      workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
      deletedAt: null,
    },
    {
      $set: {
        kind: normalizeResearchKind(data.kind),
        name: data.name,
        reach: data.reach ?? null,
        activeDays: data.activeDays ?? null,
        fbAdLink: normalizeLink(data.fbAdLink),
        storeLink: normalizeLink(data.storeLink),
        market: data.market?.trim() ?? "",
        researchedAt: resolveResearchDate(data.researchedAt),
        gender: normalizeResearchGender(data.gender ?? "unknown"),
        notes: data.notes?.trim() ?? "",
        angle: data.angle?.trim() ?? "",
        status: normalizeResearchStatus(data.status ?? "new"),
      },
    },
  );

  if (!result.matchedCount) return { error: "Entrada não encontrada." };
  revalidatePath("/pesquisa");
  return { ok: true };
}

export async function deleteResearchItemAction(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditResearch(user.role)) {
    return { error: "Sem permissão para apagar research." };
  }
  if (!id?.trim()) return { error: "ID em falta." };

  await connectToDatabase();
  const result = await ResearchItem.updateOne(
    {
      _id: id,
      workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
      deletedAt: null,
    },
    { $set: { deletedAt: new Date() } },
  );

  if (!result.matchedCount) return { error: "Entrada não encontrada." };
  revalidatePath("/pesquisa");
  return { ok: true };
}
