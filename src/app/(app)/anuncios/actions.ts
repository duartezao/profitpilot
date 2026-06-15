"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { parseDateInput } from "@/lib/period";
import { resolveAdSpendRange } from "@/lib/ad-spend";
import { AD_INPUT_CURRENCIES, isAdInputCurrency } from "@/lib/ad-currencies";
import { convertToBaseCurrency } from "@/lib/fx";

export type AdSpendState = { ok?: boolean; error?: string };

const ROLES_EDIT = ["owner", "admin", "editor"];

const schema = z.object({
  storeId: z.string().trim().min(1),
  date: z.string().trim().min(1),
  amount: z.number().min(0, "Valor inválido."),
  extraFee: z.number().min(0, "Fee inválida.").optional(),
  inputCurrency: z.enum(AD_INPUT_CURRENCIES),
  note: z.string().trim().max(500).optional(),
});

function parseOptionalFee(raw: FormDataEntryValue | null): number {
  if (raw === "" || raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function assertStore(workspaceId: string, storeId: string) {
  return Store.findOne({
    _id: storeId,
    workspaceId,
    deletedAt: null,
  }).select("_id importStartDate createdAt");
}

async function getBaseCurrency(workspaceId: string): Promise<string> {
  const ws = await Workspace.findById(workspaceId).select("baseCurrency").lean();
  return ws?.baseCurrency ?? "EUR";
}

export async function saveManualAdSpendAction(
  _prev: AdSpendState,
  formData: FormData,
): Promise<AdSpendState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar ad spend." };
  }

  const rawCurrency = String(formData.get("inputCurrency") ?? "USD").toUpperCase();
  const inputCurrency = isAdInputCurrency(rawCurrency) ? rawCurrency : "USD";

  const parsed = schema.safeParse({
    storeId: formData.get("storeId"),
    date: formData.get("date"),
    amount: Number(formData.get("amount")),
    extraFee: parseOptionalFee(formData.get("extraFee")),
    inputCurrency,
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { storeId, date, amount, note } = parsed.data;
  const extraFeeInput = parsed.data.extraFee ?? 0;

  const day = parseDateInput(date);
  if (!day) return { error: "Data inválida." };

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (day > today) {
    return { error: "Não podes registar ad spend para dias futuros." };
  }

  await connectToDatabase();
  const store = await assertStore(user.workspaceId, storeId);
  if (!store) return { error: "Loja não encontrada." };

  const { fromKey } = resolveAdSpendRange(
    store.importStartDate,
    store.createdAt,
  );
  if (date < fromKey) {
    return {
      error: `Só podes registar ad spend a partir de ${fromKey} (data de importação da loja).`,
    };
  }

  const baseCurrency = await getBaseCurrency(user.workspaceId);

  let fx;
  let fxExtra = { amountBase: 0 };
  try {
    fx = await convertToBaseCurrency(
      amount,
      parsed.data.inputCurrency,
      baseCurrency,
      date,
    );
    if (extraFeeInput > 0) {
      fxExtra = await convertToBaseCurrency(
        extraFeeInput,
        parsed.data.inputCurrency,
        baseCurrency,
        date,
      );
    }
  } catch (e) {
    return {
      error:
        e instanceof Error ? e.message : "Falha na conversão de moeda.",
    };
  }

  await ManualAdSpend.findOneAndUpdate(
    { storeId: store._id, dateKey: date },
    {
      $set: {
        workspaceId: user.workspaceId,
        storeId: store._id,
        dateKey: date,
        amount: fx.amountBase,
        currency: baseCurrency,
        inputAmount: fx.inputAmount,
        inputCurrency: fx.inputCurrency,
        fxRate: fx.fxRate,
        extraFee: fxExtra.amountBase,
        inputExtraFee: extraFeeInput > 0 ? extraFeeInput : null,
        note: note ?? "",
        source: "manual",
      },
    },
    { upsert: true, new: true },
  );

  revalidatePath("/anuncios");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  revalidatePath("/decisao");
  return { ok: true };
}

export async function deleteManualAdSpendAction(
  _prev: AdSpendState,
  formData: FormData,
): Promise<AdSpendState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar ad spend." };
  }

  const storeId = String(formData.get("storeId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!storeId || !date) return { error: "Dados inválidos." };

  await connectToDatabase();
  const store = await assertStore(user.workspaceId, storeId);
  if (!store) return { error: "Loja não encontrada." };

  await ManualAdSpend.deleteOne({ storeId: store._id, dateKey: date });

  revalidatePath("/anuncios");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  return { ok: true };
}
