"use server";

import mongoose from "mongoose";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Store } from "@/models/Store";
import { CashEntry } from "@/models/CashEntry";
import { parseDateInput } from "@/lib/period";
import { assertStoreAccess } from "@/lib/store-scope";
import { isManualCashType } from "@/lib/cash-entries";
import { parseLocaleNumber } from "@/lib/parse-number";

export type CashActionState = { ok?: boolean; error?: string };

const ROLES_EDIT = ["owner", "admin", "editor"];

const addSchema = z.object({
  storeId: z.string().trim().min(1),
  type: z.enum(["manual_in", "manual_out"]),
  amount: z.number().positive("Indica um valor maior que zero."),
  dueDateKey: z.string().trim().min(1),
  description: z.string().trim().min(2, "Descreve o motivo (mín. 2 caracteres).").max(500),
  confirm: z.literal("yes", {
    message: "Confirma o movimento antes de registar.",
  }),
});

export async function addCashEntryAction(
  _prev: CashActionState,
  formData: FormData,
): Promise<CashActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para registar movimentos de capital." };
  }

  const parsed = addSchema.safeParse({
    storeId: formData.get("storeId"),
    type: formData.get("type"),
    amount: parseLocaleNumber(formData.get("amount")),
    dueDateKey: String(formData.get("dueDateKey") ?? ""),
    description: String(formData.get("description") ?? "").trim(),
    confirm: formData.get("confirm") === "on" ? "yes" : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const day = parseDateInput(d.dueDateKey);
  if (!day) return { error: "Data inválida." };

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (day > today) {
    return { error: "Não podes registar movimentos em dias futuros." };
  }

  try {
    assertStoreAccess(user.storeAccess, d.storeId);
  } catch {
    return { error: "Sem acesso a esta loja." };
  }

  await connectToDatabase();
  const store = await Store.findOne({
    _id: d.storeId,
    workspaceId: user.workspaceId,
    deletedAt: null,
  })
    .select("currency")
    .lean();
  if (!store) return { error: "Loja não encontrada." };

  if (!isManualCashType(d.type)) {
    return { error: "Tipo de movimento inválido." };
  }

  await CashEntry.create({
    workspaceId: user.workspaceId,
    storeId: store._id,
    type: d.type,
    amount: d.amount,
    currency: store.currency ?? "EUR",
    dueDateKey: d.dueDateKey,
    description: d.description,
    createdBy: new mongoose.Types.ObjectId(user.id),
  });

  revalidatePath("/definicoes");
  revalidatePath("/tesouraria");
  revalidatePath("/financas");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteCashEntryAction(
  _prev: CashActionState,
  formData: FormData,
): Promise<CashActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão." };
  }

  const entryId = String(formData.get("entryId") ?? "");
  if (!mongoose.isValidObjectId(entryId)) {
    return { error: "Registo inválido." };
  }

  await connectToDatabase();
  const entry = await CashEntry.findOne({
    _id: entryId,
    workspaceId: user.workspaceId,
    deletedAt: null,
    type: { $in: ["manual_in", "manual_out"] },
  }).lean();
  if (!entry) return { error: "Registo não encontrado." };

  try {
    assertStoreAccess(user.storeAccess, String(entry.storeId));
  } catch {
    return { error: "Sem acesso a esta loja." };
  }

  await CashEntry.updateOne(
    { _id: entry._id },
    { $set: { deletedAt: new Date() } },
  );

  revalidatePath("/definicoes");
  revalidatePath("/tesouraria");
  revalidatePath("/financas");
  return { ok: true };
}
