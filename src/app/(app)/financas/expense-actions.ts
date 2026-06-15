"use server";

import mongoose from "mongoose";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_FREQUENCIES,
} from "@/lib/expense-constants";
import { Expense } from "@/models/Expense";
import { parseDateInput } from "@/lib/period";
import { assertStoreAccess } from "@/lib/store-scope";
import { parseLocaleNumber } from "@/lib/parse-number";
import { convertExpenseToBase } from "@/lib/expenses";
import { isAdInputCurrency } from "@/lib/fx";

export type ExpenseActionState = { ok?: boolean; error?: string };

const ROLES_EDIT = ["owner", "admin", "editor"];

const addSchema = z.object({
  name: z.string().trim().min(2, "Nome demasiado curto.").max(120),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive("Indica um valor maior que zero."),
  currency: z.string().trim().min(3).max(3),
  frequency: z.enum(EXPENSE_FREQUENCIES),
  startDateKey: z.string().trim().min(10),
  endDateKey: z.string().trim().optional(),
  storeId: z.string().trim().optional(),
});

export async function addExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para registar despesas." };
  }

  const storeRaw = String(formData.get("storeId") ?? "").trim();
  const endRaw = String(formData.get("endDateKey") ?? "").trim();

  const parsed = addSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    amount: parseLocaleNumber(formData.get("amount")),
    currency: String(formData.get("currency") ?? "EUR").toUpperCase(),
    frequency: formData.get("frequency"),
    startDateKey: String(formData.get("startDateKey") ?? ""),
    endDateKey: endRaw || undefined,
    storeId: storeRaw || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  if (!isAdInputCurrency(d.currency)) {
    return { error: "Moeda inválida (EUR, USD ou GBP)." };
  }

  if (!parseDateInput(d.startDateKey)) {
    return { error: "Data de início inválida." };
  }
  if (d.endDateKey && !parseDateInput(d.endDateKey)) {
    return { error: "Data de fim inválida." };
  }
  if (d.endDateKey && d.endDateKey < d.startDateKey) {
    return { error: "A data de fim não pode ser anterior ao início." };
  }

  if (d.storeId) {
    try {
      assertStoreAccess(user.storeAccess, d.storeId);
    } catch {
      return { error: "Sem acesso a esta loja." };
    }
  }

  await connectToDatabase();
  const workspace = await Workspace.findById(user.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = workspace?.baseCurrency ?? "EUR";

  let storeOid: mongoose.Types.ObjectId | null = null;
  if (d.storeId) {
    const store = await Store.findOne({
      _id: d.storeId,
      workspaceId: user.workspaceId,
      deletedAt: null,
    })
      .select("_id")
      .lean();
    if (!store) return { error: "Loja não encontrada." };
    storeOid = store._id;
  }

  const { amountBase } = await convertExpenseToBase(
    d.amount,
    d.currency,
    baseCurrency,
    d.startDateKey,
  );

  await Expense.create({
    workspaceId: user.workspaceId,
    storeId: storeOid,
    name: d.name,
    category: d.category,
    amount: d.amount,
    currency: d.currency,
    amountBase,
    frequency: d.frequency,
    recurring: d.frequency !== "one-time",
    startDateKey: d.startDateKey,
    endDateKey: d.endDateKey ?? null,
    createdBy: new mongoose.Types.ObjectId(user.id),
  });

  revalidatePath("/financas");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão." };
  }

  const expenseId = String(formData.get("expenseId") ?? "");
  if (!mongoose.isValidObjectId(expenseId)) {
    return { error: "Registo inválido." };
  }

  await connectToDatabase();
  const expense = await Expense.findOne({
    _id: expenseId,
    workspaceId: user.workspaceId,
    deletedAt: null,
  }).lean();
  if (!expense) return { error: "Despesa não encontrada." };

  if (expense.storeId) {
    try {
      assertStoreAccess(user.storeAccess, String(expense.storeId));
    } catch {
      return { error: "Sem acesso a esta loja." };
    }
  }

  await Expense.updateOne(
    { _id: expense._id },
    { $set: { deletedAt: new Date() } },
  );

  revalidatePath("/financas");
  revalidatePath("/dashboard");
  return { ok: true };
}
