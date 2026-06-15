"use server";

import mongoose from "mongoose";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { DailyNote } from "@/models/DailyNote";
import { Store } from "@/models/Store";
import { storeQueryForUser, assertStoreAccess } from "@/lib/store-scope";
import { parseDateInput, startOfDay, endOfDay } from "@/lib/period";

export type NoteState = { ok?: boolean; error?: string };

const ROLES_EDIT = ["owner", "admin", "editor"];

const reportFieldSchema = z.string().trim().max(500).optional();

const noteSchema = z.object({
  storeId: z.string().trim().optional(),
  date: z.string().trim().min(1),
  didScale: z.boolean(),
  text: z.string().trim().max(5000),
  mood: z.enum(["good", "bad", "neutral", ""]).optional(),
  productsTested: reportFieldSchema,
  collectionsTested: reportFieldSchema,
  collectionsTestedList: reportFieldSchema,
  nextCollection: reportFieldSchema,
  bestSellerCollection: reportFieldSchema,
  difficulties: reportFieldSchema,
  obs: reportFieldSchema,
});

export async function saveDailyNoteAction(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar notas." };
  }

  const parsed = noteSchema.safeParse({
    storeId: String(formData.get("storeId") ?? "").trim() || undefined,
    date: formData.get("date"),
    didScale: formData.get("didScale") === "on",
    text: formData.get("text") ?? "",
    mood: String(formData.get("mood") ?? ""),
    productsTested: String(formData.get("productsTested") ?? ""),
    collectionsTested: String(formData.get("collectionsTested") ?? ""),
    collectionsTestedList: String(formData.get("collectionsTestedList") ?? ""),
    nextCollection: String(formData.get("nextCollection") ?? ""),
    bestSellerCollection: String(formData.get("bestSellerCollection") ?? ""),
    difficulties: String(formData.get("difficulties") ?? ""),
    obs: String(formData.get("obs") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  const parsedDay = parseDateInput(d.date);
  if (!parsedDay) {
    return { error: "Data inválida." };
  }
  const noteDate = startOfDay(parsedDay);
  const dayEnd = endOfDay(noteDate);

  await connectToDatabase();

  let storeOid: mongoose.Types.ObjectId | null = null;
  if (d.storeId) {
    try {
      assertStoreAccess(user.storeAccess, d.storeId);
    } catch {
      return { error: "Sem acesso a esta loja." };
    }
    const store = await Store.findOne(
      storeQueryForUser(user, { _id: d.storeId }),
    );
    if (!store) return { error: "Loja não encontrada neste workspace." };
    storeOid = store._id;
  }

  const mood =
    d.mood === "good" || d.mood === "bad" || d.mood === "neutral"
      ? d.mood
      : undefined;

  const payload = {
    didScale: d.didScale,
    text: d.text,
    mood,
    date: noteDate,
    reportFields: {
      productsTested: d.productsTested ?? "",
      collectionsTested: d.collectionsTested ?? "",
      collectionsTestedList: d.collectionsTestedList ?? "",
      nextCollection: d.nextCollection ?? "",
      bestSellerCollection: d.bestSellerCollection ?? "",
      difficulties: d.difficulties ?? "",
      obs: d.obs ?? "",
    },
  };

  const existing = await DailyNote.findOne({
    workspaceId: user.workspaceId,
    storeId: storeOid,
    date: { $gte: noteDate, $lte: dayEnd },
  });

  if (existing) {
    await DailyNote.updateOne({ _id: existing._id }, { $set: payload });
  } else {
    await DailyNote.create({
      workspaceId: user.workspaceId,
      storeId: storeOid,
      ...payload,
    });
  }

  revalidatePath("/notas");
  revalidatePath("/metricas");
  revalidatePath("/dashboard");
  return { ok: true };
}
