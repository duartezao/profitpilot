"use server";

import mongoose from "mongoose";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Workspace } from "@/models/Workspace";
import { PersonalExpense } from "@/models/PersonalExpense";
import { parseDateInput } from "@/lib/period";
import { parseLocaleNumber } from "@/lib/parse-number";
import { convertExpenseToBase } from "@/lib/expenses";
import { isAdInputCurrency } from "@/lib/fx";
import { isActiveWorkspaceMember } from "@/lib/members";

export type PersonalExpenseActionState = { ok?: boolean; error?: string };

const ROLES_MANAGE_ANY = ["owner", "admin"];

const entrySchema = z.object({
  description: z.string().trim().min(2, "Descrição demasiado curta.").max(200),
  amount: z.number().positive("Indica um valor maior que zero."),
  currency: z.string().trim().min(3).max(3),
  dateKey: z.string().trim().min(10),
  userId: z.string().trim().optional(),
});

export async function addPersonalExpenseAction(
  _prev: PersonalExpenseActionState,
  formData: FormData,
): Promise<PersonalExpenseActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = entrySchema.safeParse({
    description: formData.get("description"),
    amount: parseLocaleNumber(formData.get("amount")),
    currency: String(formData.get("currency") ?? "EUR").toUpperCase(),
    dateKey: String(formData.get("dateKey") ?? ""),
    userId: String(formData.get("userId") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  if (!isAdInputCurrency(d.currency)) {
    return { error: "Moeda inválida (EUR, USD ou GBP)." };
  }
  if (!parseDateInput(d.dateKey)) {
    return { error: "Data inválida." };
  }

  const targetUserId = d.userId || user.id;
  const canAssignOther = ROLES_MANAGE_ANY.includes(user.role);
  if (targetUserId !== user.id && !canAssignOther) {
    return { error: "Só podes registar despesas a teu nome." };
  }
  if (!(await isActiveWorkspaceMember(user.workspaceId, targetUserId))) {
    return { error: "Membro inválido ou inactivo." };
  }

  await connectToDatabase();
  const ws = await Workspace.findById(user.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = (ws?.baseCurrency ?? "EUR").toUpperCase();
  const { amountBase } = await convertExpenseToBase(
    d.amount,
    d.currency,
    baseCurrency,
    d.dateKey,
  );

  await PersonalExpense.create({
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    userId: new mongoose.Types.ObjectId(targetUserId),
    dateKey: d.dateKey,
    description: d.description,
    amount: d.amount,
    currency: d.currency,
    amountBase,
    createdBy: new mongoose.Types.ObjectId(user.id),
  });

  revalidatePath("/financas");
  return { ok: true };
}

export async function updatePersonalExpenseAction(
  _prev: PersonalExpenseActionState,
  formData: FormData,
): Promise<PersonalExpenseActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { error: "Registo inválido." };
  }

  const parsed = entrySchema.safeParse({
    description: formData.get("description"),
    amount: parseLocaleNumber(formData.get("amount")),
    currency: String(formData.get("currency") ?? "EUR").toUpperCase(),
    dateKey: String(formData.get("dateKey") ?? ""),
    userId: String(formData.get("userId") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  if (!isAdInputCurrency(d.currency)) {
    return { error: "Moeda inválida (EUR, USD ou GBP)." };
  }
  if (!parseDateInput(d.dateKey)) {
    return { error: "Data inválida." };
  }

  await connectToDatabase();
  const row = await PersonalExpense.findOne({
    _id: id,
    workspaceId: user.workspaceId,
    deletedAt: null,
  });
  if (!row) return { error: "Registo não encontrado." };

  const isOwner = String(row.userId) === user.id;
  const canManageAny = ROLES_MANAGE_ANY.includes(user.role);
  if (!isOwner && !canManageAny) {
    return { error: "Sem permissão para editar este registo." };
  }

  let targetUserId = String(row.userId);
  if (d.userId && d.userId !== targetUserId) {
    if (!canManageAny) {
      return { error: "Sem permissão para alterar a pessoa." };
    }
    if (!(await isActiveWorkspaceMember(user.workspaceId, d.userId))) {
      return { error: "Membro inválido ou inactivo." };
    }
    targetUserId = d.userId;
  }

  const ws = await Workspace.findById(user.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = (ws?.baseCurrency ?? "EUR").toUpperCase();
  const { amountBase } = await convertExpenseToBase(
    d.amount,
    d.currency,
    baseCurrency,
    d.dateKey,
  );

  row.description = d.description;
  row.amount = d.amount;
  row.currency = d.currency;
  row.amountBase = amountBase;
  row.dateKey = d.dateKey;
  row.userId = new mongoose.Types.ObjectId(targetUserId);
  await row.save();

  revalidatePath("/financas");
  return { ok: true };
}

export async function deletePersonalExpenseAction(
  _prev: PersonalExpenseActionState,
  formData: FormData,
): Promise<PersonalExpenseActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { error: "Registo inválido." };
  }

  await connectToDatabase();
  const row = await PersonalExpense.findOne({
    _id: id,
    workspaceId: user.workspaceId,
    deletedAt: null,
  });
  if (!row) return { error: "Registo não encontrado." };

  const isOwner = String(row.userId) === user.id;
  const canManageAny = ROLES_MANAGE_ANY.includes(user.role);
  if (!isOwner && !canManageAny) {
    return { error: "Sem permissão para apagar este registo." };
  }

  row.deletedAt = new Date();
  await row.save();

  revalidatePath("/financas");
  return { ok: true };
}
