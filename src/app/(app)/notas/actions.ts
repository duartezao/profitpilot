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

export type NoteState = { ok?: boolean; error?: string };

const ROLES_EDIT = ["owner", "admin", "editor"];

const noteSchema = z.object({
  storeId: z.string().trim().optional(),
  date: z.string().trim().min(1),
  didScale: z.boolean(),
  text: z.string().trim().max(5000),
  mood: z.enum(["good", "bad", "neutral", ""]).optional(),
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
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  const noteDate = new Date(d.date);
  if (Number.isNaN(noteDate.getTime())) {
    return { error: "Data inválida." };
  }

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

  await DailyNote.findOneAndUpdate(
    {
      workspaceId: user.workspaceId,
      storeId: storeOid,
      date: noteDate,
    },
    {
      $set: {
        didScale: d.didScale,
        text: d.text,
        mood,
      },
    },
    { upsert: true, new: true },
  );

  revalidatePath("/notas");
  revalidatePath("/dashboard");
  return { ok: true };
}
