"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Store } from "@/models/Store";
import { parseDateInput } from "@/lib/period";
import {
  ensureFeeSchedule,
  normalizeFeeConfig,
  sortFeeSchedule,
  type FeeScheduleEntry,
} from "@/lib/fee-schedule";
import {
  dateKeyInTimezone,
  importDateKey,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import { findStoreForUser } from "@/lib/store-scope";

export type FeeScheduleState = { ok?: boolean; error?: string };

const ROLES_EDIT = ["owner", "admin", "editor"];

const entrySchema = z.object({
  storeId: z.string().trim().min(1),
  effectiveFromKey: z.string().trim().min(1),
  processingPercent: z.number().min(0).max(100),
  processingFixed: z.number().min(0),
  transactionFeePercent: z.number().min(0).max(100),
});

export async function addFeeScheduleEntryAction(
  _prev: FeeScheduleState,
  formData: FormData,
): Promise<FeeScheduleState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para alterar taxas." };
  }

  const parsed = entrySchema.safeParse({
    storeId: formData.get("storeId"),
    effectiveFromKey: String(formData.get("effectiveFromKey") ?? ""),
    processingPercent: Number(formData.get("processingPercent")),
    processingFixed: Number(formData.get("processingFixed")),
    transactionFeePercent: Number(formData.get("transactionFeePercent")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const day = parseDateInput(d.effectiveFromKey);
  if (!day) return { error: "Data inválida." };

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    d.storeId,
    "feeConfig feeSchedule importStartDate createdAt ianaTimezone currency",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const floorKey =
    importDateKey(store.importStartDate, store.createdAt, tz) ??
    dateKeyInTimezone(new Date(store.createdAt ?? Date.now()), tz);

  if (d.effectiveFromKey < floorKey) {
    return {
      error: `A taxa só pode aplicar-se a partir de ${floorKey} (início da loja).`,
    };
  }

  let schedule = ensureFeeSchedule(
    store.feeSchedule as FeeScheduleEntry[] | undefined,
    store.feeConfig,
    floorKey,
  );

  if (schedule.some((e) => e.effectiveFromKey === d.effectiveFromKey)) {
    return {
      error: "Já existe uma taxa com esta data. Escolhe outro dia.",
    };
  }

  const newEntry: FeeScheduleEntry = {
    effectiveFromKey: d.effectiveFromKey,
    ...normalizeFeeConfig(d),
  };

  schedule = sortFeeSchedule([...schedule, newEntry]);
  const latest = schedule[schedule.length - 1]!;

  await Store.updateOne(
    { _id: store._id },
    {
      $set: {
        feeSchedule: schedule,
        feeConfig: normalizeFeeConfig(latest),
      },
    },
  );

  revalidatePath("/definicoes");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  revalidatePath("/metricas");
  return { ok: true };
}
