"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ProductCost } from "@/models/ProductCost";
import {
  backfillMissingLineCosts,
  closeManualCostHistory,
  recordManualCostChange,
} from "@/lib/cogs";
import { parseCogsCsv } from "@/lib/cogs-csv";
import { Order } from "@/models/Order";
import {
  saveManualCogsDay,
  saveManualOrderCogs,
  clearManualOrderCogs,
  isCogsInputCurrency,
} from "@/lib/manual-cogs";
import { saveEuCategoryFeeDay, EU_CATEGORY_FEE_EFFECTIVE_FROM } from "@/lib/eu-category-fees";
import { convertCogsInputToStoreCurrency } from "@/lib/order-money";
import { formatDateInput, parseDateInput } from "@/lib/period";
import { resolveAdSpendRange } from "@/lib/ad-spend";
import { findStoreForUser } from "@/lib/store-scope";
import { parseLocaleNumber } from "@/lib/parse-number";

export type CostState = { ok?: boolean; error?: string };

export type CogsImportState = {
  ok?: boolean;
  error?: string;
  imported?: number;
  skipped?: number;
  warnings?: string[];
};

export type ManualCogsState = { ok?: boolean; error?: string };

const ROLES_EDIT = ["owner", "admin", "editor"];

const schema = z.object({
  storeId: z.string().trim().min(1),
  variantId: z.string().trim().min(1),
  manualCost: z.number().min(0, "Custo inválido."),
  effectiveFrom: z.string().trim().optional(),
});

export async function setManualCostAction(
  _prev: CostState,
  formData: FormData,
): Promise<CostState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar custos." };
  }

  const parsed = schema.safeParse({
    storeId: formData.get("storeId"),
    variantId: formData.get("variantId"),
    manualCost: parseLocaleNumber(formData.get("manualCost")),
    effectiveFrom: formData.get("effectiveFrom") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { storeId, variantId, manualCost, effectiveFrom } = parsed.data;

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    storeId,
    "currency cogsInputCurrency ianaTimezone importStartDate createdAt",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  const from = effectiveFrom ? new Date(effectiveFrom) : new Date(0);
  const inputCurrency = (store.cogsInputCurrency ?? "EUR").toUpperCase();
  const storeCurrency = (store.currency ?? "EUR").toUpperCase();
  let costToStore = manualCost;
  if (inputCurrency !== storeCurrency) {
    const dateKey = effectiveFrom
      ? effectiveFrom.slice(0, 10)
      : formatDateInput(new Date());
    try {
      costToStore = await convertCogsInputToStoreCurrency(
        manualCost,
        inputCurrency,
        storeCurrency,
        dateKey,
      );
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Falha na conversão de moeda.",
      };
    }
  }

  const existing = await ProductCost.findOne({ storeId: store._id, variantId })
    .select("productId")
    .lean();

  await ProductCost.updateOne(
    { storeId: store._id, variantId },
    {
      $set: {
        manualCost: costToStore,
        manualCostFrom: from,
      },
    },
    { upsert: true },
  );

  await recordManualCostChange(
    store._id,
    variantId,
    costToStore,
    from,
    existing?.productId,
  );

  // Só preenche linhas ainda sem custo — usa histórico na data de cada venda.
  await backfillMissingLineCosts(store._id, variantId, from);

  revalidatePath("/cogs");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  revalidatePath("/metricas");
  revalidatePath("/decisao");
  return { ok: true };
}

export async function clearManualCostAction(
  _prev: CostState,
  formData: FormData,
): Promise<CostState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar custos." };
  }

  const storeId = String(formData.get("storeId") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  if (!storeId || !variantId) return { error: "Dados inválidos." };

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    storeId,
    "currency cogsInputCurrency ianaTimezone importStartDate createdAt",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  await ProductCost.updateOne(
    { storeId: store._id, variantId },
    { $set: { manualCost: null, manualCostFrom: null, manualCostNote: null } },
  );

  await closeManualCostHistory(store._id, variantId);

  revalidatePath("/cogs");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  revalidatePath("/metricas");
  revalidatePath("/decisao");
  return { ok: true };
}

export async function importCogsCsvAction(
  _prev: CogsImportState,
  formData: FormData,
): Promise<CogsImportState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar custos." };
  }

  const storeId = String(formData.get("storeId") ?? "").trim();
  const file = formData.get("file");
  if (!storeId || !(file instanceof File)) {
    return { error: "Loja e ficheiro CSV são obrigatórios." };
  }

  const text = await file.text();
  const parsed = parseCogsCsv(text);
  if (parsed.rows.length === 0) {
    return {
      error: parsed.errors[0] ?? "CSV sem linhas válidas.",
      warnings: parsed.errors.slice(1),
    };
  }

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    storeId,
    "currency cogsInputCurrency ianaTimezone importStartDate createdAt",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  const effectiveFrom = new Date();
  let imported = 0;

  for (const row of parsed.rows) {
    const existing = await ProductCost.findOne({
      storeId: store._id,
      variantId: row.variantId,
    })
      .select("productId manualCost")
      .lean();

    if (existing?.manualCost === row.cost) {
      continue;
    }

    await ProductCost.updateOne(
      { storeId: store._id, variantId: row.variantId },
      {
        $set: {
          manualCost: row.cost,
          manualCostFrom: effectiveFrom,
          ...(row.title ? { title: row.title } : {}),
        },
      },
      { upsert: true },
    );

    await recordManualCostChange(
      store._id,
      row.variantId,
      row.cost,
      effectiveFrom,
      existing?.productId,
    );

    await backfillMissingLineCosts(store._id, row.variantId, effectiveFrom);
    imported++;
  }

  revalidatePath("/cogs");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  revalidatePath("/metricas");
  revalidatePath("/decisao");

  return {
    ok: true,
    imported,
    skipped: parsed.rows.length - imported,
    warnings: parsed.errors,
  };
}

const dayCogsSchema = z.object({
  storeId: z.string().trim().min(1),
  date: z.string().trim().min(1),
  amount: z.number().min(0, "Valor inválido."),
  inputCurrency: z.enum(["EUR", "USD"]),
  note: z.string().trim().max(500).optional(),
});

const orderCogsSchema = z.object({
  storeId: z.string().trim().min(1),
  orderId: z.string().trim().min(1),
  amount: z.number().min(0, "Valor inválido."),
  inputCurrency: z.enum(["EUR", "USD"]),
});

export async function saveManualCogsDayAction(
  _prev: ManualCogsState,
  formData: FormData,
): Promise<ManualCogsState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar COGS." };
  }

  const rawCurrency = String(formData.get("inputCurrency") ?? "EUR").toUpperCase();
  const inputCurrency = isCogsInputCurrency(rawCurrency) ? rawCurrency : "EUR";

  const parsed = dayCogsSchema.safeParse({
    storeId: formData.get("storeId"),
    date: formData.get("date"),
    amount: parseLocaleNumber(formData.get("amount")),
    inputCurrency,
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { storeId, date, amount, note } = parsed.data;
  const day = parseDateInput(date);
  if (!day) return { error: "Data inválida." };

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    storeId,
    "currency cogsInputCurrency ianaTimezone importStartDate createdAt",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  const { fromKey } = resolveAdSpendRange(store.importStartDate, store.createdAt);
  if (date < fromKey) {
    return { error: `Só podes registar COGS a partir de ${fromKey}.` };
  }

  try {
    await saveManualCogsDay(
      new mongoose.Types.ObjectId(user.workspaceId),
      store._id,
      date,
      amount,
      inputCurrency,
      new mongoose.Types.ObjectId(user.id),
      note,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao guardar COGS." };
  }

  revalidatePath("/cogs");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  revalidatePath("/metricas");
  revalidatePath("/decisao");
  return { ok: true };
}

export async function saveEuCategoryFeeDayAction(
  _prev: ManualCogsState,
  formData: FormData,
): Promise<ManualCogsState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar taxas." };
  }

  const rawCurrency = String(formData.get("inputCurrency") ?? "EUR").toUpperCase();
  const inputCurrency = isCogsInputCurrency(rawCurrency) ? rawCurrency : "EUR";

  const parsed = dayCogsSchema.safeParse({
    storeId: formData.get("storeId"),
    date: formData.get("date"),
    amount: parseLocaleNumber(formData.get("amount")),
    inputCurrency,
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { storeId, date, amount, note } = parsed.data;
  const day = parseDateInput(date);
  if (!day) return { error: "Data inválida." };

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    storeId,
    "currency cogsInputCurrency ianaTimezone importStartDate createdAt",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  const { fromKey } = resolveAdSpendRange(store.importStartDate, store.createdAt);
  const minKey =
    fromKey > EU_CATEGORY_FEE_EFFECTIVE_FROM
      ? fromKey
      : EU_CATEGORY_FEE_EFFECTIVE_FROM;
  if (date < minKey) {
    return {
      error: `Só podes registar taxas a partir de ${minKey} (vigência da taxa EU: ${EU_CATEGORY_FEE_EFFECTIVE_FROM}).`,
    };
  }

  try {
    await saveEuCategoryFeeDay(
      new mongoose.Types.ObjectId(user.workspaceId),
      store._id,
      date,
      amount,
      inputCurrency,
      new mongoose.Types.ObjectId(user.id),
      note,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao guardar taxa." };
  }

  revalidatePath("/cogs");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  revalidatePath("/metricas");
  revalidatePath("/decisao");
  revalidatePath("/notas");
  return { ok: true };
}

export async function saveManualOrderCogsAction(
  _prev: ManualCogsState,
  formData: FormData,
): Promise<ManualCogsState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar COGS." };
  }

  const rawCurrency = String(formData.get("inputCurrency") ?? "EUR").toUpperCase();
  const inputCurrency = isCogsInputCurrency(rawCurrency) ? rawCurrency : "EUR";

  const parsed = orderCogsSchema.safeParse({
    storeId: formData.get("storeId"),
    orderId: formData.get("orderId"),
    amount: parseLocaleNumber(formData.get("amount")),
    inputCurrency,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { storeId, orderId, amount } = parsed.data;

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    storeId,
    "currency cogsInputCurrency ianaTimezone importStartDate createdAt",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  const order = await Order.findOne({
    _id: orderId,
    storeId: store._id,
    workspaceId: user.workspaceId,
  }).select("_id");
  if (!order) return { error: "Encomenda não encontrada." };

  try {
    await saveManualOrderCogs(
      new mongoose.Types.ObjectId(user.workspaceId),
      order._id,
      amount,
      inputCurrency,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao guardar COGS." };
  }

  revalidatePath("/cogs");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  revalidatePath("/metricas");
  revalidatePath("/decisao");
  return { ok: true };
}

export async function clearManualOrderCogsAction(
  _prev: ManualCogsState,
  formData: FormData,
): Promise<ManualCogsState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar COGS." };
  }

  const storeId = String(formData.get("storeId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  if (!storeId || !orderId) return { error: "Dados inválidos." };

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    storeId,
    "currency cogsInputCurrency ianaTimezone importStartDate createdAt",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  await clearManualOrderCogs(
    new mongoose.Types.ObjectId(user.workspaceId),
    new mongoose.Types.ObjectId(orderId),
  );

  revalidatePath("/cogs");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
  revalidatePath("/metricas");
  revalidatePath("/decisao");
  return { ok: true };
}
