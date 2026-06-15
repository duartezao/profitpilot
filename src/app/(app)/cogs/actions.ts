"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Store } from "@/models/Store";
import { ProductCost } from "@/models/ProductCost";
import {
  backfillMissingLineCosts,
  closeManualCostHistory,
  recordManualCostChange,
} from "@/lib/cogs";

export type CostState = { ok?: boolean; error?: string };

const ROLES_EDIT = ["owner", "admin", "editor"];

const schema = z.object({
  storeId: z.string().trim().min(1),
  variantId: z.string().trim().min(1),
  manualCost: z.number().min(0, "Custo inválido."),
  effectiveFrom: z.string().trim().optional(),
});

async function assertStore(workspaceId: string, storeId: string) {
  const store = await Store.findOne({
    _id: storeId,
    workspaceId,
    deletedAt: null,
  }).select("_id");
  return store;
}

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
    manualCost: Number(formData.get("manualCost")),
    effectiveFrom: formData.get("effectiveFrom") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { storeId, variantId, manualCost, effectiveFrom } = parsed.data;

  await connectToDatabase();
  const store = await assertStore(user.workspaceId, storeId);
  if (!store) return { error: "Loja não encontrada." };

  const from = effectiveFrom ? new Date(effectiveFrom) : new Date(0);

  const existing = await ProductCost.findOne({ storeId: store._id, variantId })
    .select("productId")
    .lean();

  await ProductCost.updateOne(
    { storeId: store._id, variantId },
    {
      $set: {
        manualCost,
        manualCostFrom: from,
      },
    },
    { upsert: true },
  );

  await recordManualCostChange(
    store._id,
    variantId,
    manualCost,
    from,
    existing?.productId,
  );

  // Só preenche linhas ainda sem custo — usa histórico na data de cada venda.
  await backfillMissingLineCosts(store._id, variantId, from);

  revalidatePath("/cogs");
  revalidatePath("/dashboard");
  revalidatePath("/financas");
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
  const store = await assertStore(user.workspaceId, storeId);
  if (!store) return { error: "Loja não encontrada." };

  await ProductCost.updateOne(
    { storeId: store._id, variantId },
    { $set: { manualCost: null, manualCostFrom: null, manualCostNote: null } },
  );

  await closeManualCostHistory(store._id, variantId);

  revalidatePath("/cogs");
  return { ok: true };
}
