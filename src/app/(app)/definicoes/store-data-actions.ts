"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Store } from "@/models/Store";
import { findStoreForUser } from "@/lib/store-scope";
import { parseDateInput } from "@/lib/period";
import { zLocaleNumber } from "@/lib/parse-number";
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
import { purgeStoreCompletely } from "@/lib/store-purge";
import {
  deleteOrdersBeforeImportDate,
  recalculateStoreOrderFees,
} from "@/lib/store-fees-recalc";

export type StoreDataState = { ok?: boolean; error?: string; message?: string };

const ROLES_ADMIN = ["owner", "admin"];
const ROLES_EDIT = ["owner", "admin", "editor"];

const reconfigureSchema = z.object({
  storeId: z.string().trim().min(1),
  importStartDate: z.string().trim().min(1),
  processingPercent: zLocaleNumber(z.number().min(0).max(100)),
  processingFixed: zLocaleNumber(z.number().min(0)),
  transactionFeePercent: zLocaleNumber(z.number().min(0).max(100)),
  recalculateFees: z.boolean(),
  trimOrdersBeforeDate: z.boolean(),
});

const deleteSchema = z.object({
  storeId: z.string().trim().min(1),
  confirmName: z.string().trim().min(1),
  acknowledge: z.literal("yes"),
});

function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const timezoneSchema = z.object({
  storeId: z.string().trim().min(1),
  // "" = voltar ao fuso automático da Shopify.
  timezone: z.string().trim().max(64),
});

function revalidateStorePaths() {
  revalidatePath("/definicoes");
  revalidatePath("/lojas");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  revalidatePath("/metricas");
  revalidatePath("/tesouraria");
  revalidatePath("/anuncios");
  revalidatePath("/cogs");
  revalidatePath("/notas");
  revalidatePath("/decisao");
  revalidatePath("/", "layout");
}

export async function reconfigureStoreImportAction(
  _prev: StoreDataState,
  formData: FormData,
): Promise<StoreDataState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para reconfigurar lojas." };
  }

  const parsed = reconfigureSchema.safeParse({
    storeId: formData.get("storeId"),
    importStartDate: formData.get("importStartDate"),
    processingPercent: formData.get("processingPercent"),
    processingFixed: formData.get("processingFixed"),
    transactionFeePercent: formData.get("transactionFeePercent"),
    recalculateFees: formData.get("recalculateFees") === "on",
    trimOrdersBeforeDate: formData.get("trimOrdersBeforeDate") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const importDay = parseDateInput(d.importStartDate);
  if (!importDay) return { error: "Data de importação inválida." };
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (importDay > today) {
    return { error: "A data de importação não pode ser no futuro." };
  }

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    d.storeId,
    "importStartDate createdAt ianaTimezone feeConfig feeSchedule currency",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const newFloorKey = dateKeyInTimezone(importDay, tz);
  const feeConfig = normalizeFeeConfig({
    processingPercent: d.processingPercent,
    processingFixed: d.processingFixed,
    transactionFeePercent: d.transactionFeePercent,
  });

  let schedule = ensureFeeSchedule(
    store.feeSchedule as FeeScheduleEntry[] | undefined,
    store.feeConfig,
    newFloorKey,
  );

  const oldFloorKey =
    importDateKey(store.importStartDate, store.createdAt, tz) ?? newFloorKey;
  const initialIdx = schedule.findIndex(
    (e) => e.effectiveFromKey === oldFloorKey,
  );

  if (initialIdx >= 0) {
    schedule[initialIdx] = {
      effectiveFromKey: newFloorKey,
      ...feeConfig,
    };
  } else if (schedule.length === 1) {
    schedule[0] = { effectiveFromKey: newFloorKey, ...feeConfig };
  } else {
    const conflict = schedule.some(
      (e) => e.effectiveFromKey === newFloorKey && e !== schedule[initialIdx],
    );
    if (conflict) {
      return {
        error:
          "Já existe uma taxa com esta data no calendário. Ajusta em Taxas de processamento ou escolhe outra data.",
      };
    }
    schedule = sortFeeSchedule([
      { effectiveFromKey: newFloorKey, ...feeConfig },
      ...schedule,
    ]);
  }

  schedule = sortFeeSchedule(schedule);
  const latest = schedule[schedule.length - 1]!;

  let trimmed = 0;
  if (d.trimOrdersBeforeDate) {
    trimmed = await deleteOrdersBeforeImportDate(d.storeId, importDay);
  }

  await Store.updateOne(
    { _id: store._id },
    {
      $set: {
        importStartDate: importDay,
        feeConfig: normalizeFeeConfig(latest),
        feeSchedule: schedule,
      },
    },
  );

  let recalculated = 0;
  if (d.recalculateFees) {
    recalculated = await recalculateStoreOrderFees(d.storeId);
  }

  revalidateStorePaths();

  const parts: string[] = ["Importação reconfigurada."];
  if (recalculated > 0) {
    parts.push(
      `${recalculated} encomenda${recalculated === 1 ? "" : "s"} com taxas actualizadas.`,
    );
  }
  if (trimmed > 0) {
    parts.push(
      `${trimmed} encomenda${trimmed === 1 ? "" : "s"} anteriores à nova data removidas.`,
    );
  }

  return { ok: true, message: parts.join(" ") };
}

export async function updateStoreTimezoneAction(
  _prev: StoreDataState,
  formData: FormData,
): Promise<StoreDataState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para alterar o fuso horário." };
  }

  const parsed = timezoneSchema.safeParse({
    storeId: formData.get("storeId"),
    timezone: formData.get("timezone") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { storeId, timezone } = parsed.data;

  await connectToDatabase();
  const store = await findStoreForUser(user, storeId, "name ianaTimezone");
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  if (timezone.length === 0) {
    // Voltar ao fuso automático da Shopify (re-sincroniza no próximo sync).
    await Store.updateOne(
      { _id: store._id },
      { $set: { timezoneSource: "shopify" } },
    );
    revalidateStorePaths();
    return {
      ok: true,
      message: "Fuso horário automático (Shopify) reativado.",
    };
  }

  if (!isValidIanaTimezone(timezone)) {
    return { error: "Fuso horário inválido. Usa um identificador IANA (ex. Europe/Lisbon)." };
  }

  await Store.updateOne(
    { _id: store._id },
    { $set: { ianaTimezone: timezone, timezoneSource: "manual" } },
  );
  revalidateStorePaths();
  return { ok: true, message: `Fuso horário definido para ${timezone}.` };
}

export async function permanentlyDeleteStoreAction(
  _prev: StoreDataState,
  formData: FormData,
): Promise<StoreDataState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_ADMIN.includes(user.role)) {
    return { error: "Só o proprietário ou administrador pode apagar lojas." };
  }

  const parsed = deleteSchema.safeParse({
    storeId: formData.get("storeId"),
    confirmName: formData.get("confirmName"),
    acknowledge: formData.get("acknowledge") === "on" ? "yes" : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Confirmação inválida." };
  }

  await connectToDatabase();
  const store = await findStoreForUser(user, parsed.data.storeId, "name");
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  if (parsed.data.confirmName.trim() !== store.name) {
    return { error: "O nome escrito não coincide com o nome da loja." };
  }

  await purgeStoreCompletely(parsed.data.storeId, user.workspaceId);
  revalidateStorePaths();
  redirect("/lojas");
}
