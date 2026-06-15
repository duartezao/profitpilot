"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Workspace } from "@/models/Workspace";
import { Store } from "@/models/Store";
import { Order } from "@/models/Order";
import { Payout } from "@/models/Payout";
import { BalanceTransaction } from "@/models/BalanceTransaction";
import { Membership } from "@/models/Membership";
import { isValidSessionCountry, normalizeSessionCountry } from "@/lib/shopify-countries";
import { isMyshopifyDomain, normalizeDisplayUrl } from "@/lib/store-display";

export type SettingsState = { ok?: boolean; error?: string };

const ROLES_ADMIN = ["owner", "admin"];
const ROLES_EDIT = ["owner", "admin", "editor"];

const numOpt = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const workspaceSchema = z.object({
  name: z.string().trim().min(1, "Dá um nome ao workspace."),
  baseCurrency: z.string().trim().length(3, "Moeda em formato ISO (ex.: EUR)."),
  taxReservePercent: z.number().min(0).max(100),
  netMarginMin: z.number(),
  refundRateMax: z.number(),
  chargebackRateMax: z.number(),
});

export async function updateWorkspaceAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_ADMIN.includes(user.role)) {
    return { error: "Sem permissão para editar o workspace." };
  }

  const parsed = workspaceSchema.safeParse({
    name: formData.get("name"),
    baseCurrency: String(formData.get("baseCurrency") ?? "").toUpperCase(),
    taxReservePercent: numOpt(formData.get("taxReservePercent")),
    netMarginMin: numOpt(formData.get("netMarginMin")),
    refundRateMax: numOpt(formData.get("refundRateMax")),
    chargebackRateMax: numOpt(formData.get("chargebackRateMax")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  await connectToDatabase();
  await Workspace.updateOne(
    { _id: user.workspaceId },
    {
      $set: {
        name: d.name,
        baseCurrency: d.baseCurrency,
        taxReservePercent: d.taxReservePercent,
        "targets.netMarginMin": d.netMarginMin,
        "targets.refundRateMax": d.refundRateMax,
        "targets.chargebackRateMax": d.chargebackRateMax,
      },
    },
  );

  revalidatePath("/definicoes");
  revalidatePath("/dashboard");
  return { ok: true };
}

const storeSchema = z.object({
  storeId: z.string().trim().min(1),
  name: z.string().trim().min(1, "Dá um nome à loja."),
  status: z.enum(["active", "paused", "archived"]),
  autoSync: z.boolean(),
  processingPercent: z.number().min(0).max(100),
  processingFixed: z.number().min(0),
  transactionFeePercent: z.number().min(0).max(100),
  startingBalance: z.number(),
  startingBalanceDate: z.string().trim(),
  analyticsSessionCountry: z.string().trim(),
  displayUrl: z
    .string()
    .trim()
    .min(1, "Indica o URL público da loja.")
    .refine(
      (v) => !isMyshopifyDomain(v),
      "Usa o domínio público (.com), não o .myshopify.com.",
    ),
});

export async function updateStoreSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar lojas." };
  }

  const parsed = storeSchema.safeParse({
    storeId: formData.get("storeId"),
    name: formData.get("name"),
    status: formData.get("status"),
    autoSync: formData.get("autoSync") === "on",
    processingPercent: numOpt(formData.get("processingPercent")),
    processingFixed: numOpt(formData.get("processingFixed")),
    transactionFeePercent: numOpt(formData.get("transactionFeePercent")),
    startingBalance: numOpt(formData.get("startingBalance")),
    startingBalanceDate: String(formData.get("startingBalanceDate") ?? ""),
    analyticsSessionCountry: String(
      formData.get("analyticsSessionCountry") ?? "",
    ),
    displayUrl: String(formData.get("displayUrl") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  const analyticsSessionCountry = normalizeSessionCountry(
    d.analyticsSessionCountry || null,
  );
  if (!isValidSessionCountry(d.analyticsSessionCountry || null)) {
    return { error: "País de sessões inválido." };
  }
  const startingBalanceDate = d.startingBalanceDate
    ? new Date(d.startingBalanceDate)
    : null;

  await connectToDatabase();
  const res = await Store.updateOne(
    { _id: d.storeId, workspaceId: user.workspaceId, deletedAt: null },
    {
      $set: {
        name: d.name,
        status: d.status,
        autoSync: d.autoSync,
        "feeConfig.processingPercent": d.processingPercent,
        "feeConfig.processingFixed": d.processingFixed,
        "feeConfig.transactionFeePercent": d.transactionFeePercent,
        startingBalance: d.startingBalance,
        startingBalanceDate,
        analyticsSessionCountry,
        displayUrl: normalizeDisplayUrl(d.displayUrl),
      },
    },
  );
  if (res.matchedCount === 0) {
    return { error: "Loja não encontrada." };
  }

  revalidatePath("/definicoes");
  revalidatePath("/lojas");
  revalidatePath("/dashboard");
  return { ok: true };
}

const assignWorkspaceSchema = z.object({
  storeId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
});

/** Move uma loja a outro workspace (owner/admin em origem e destino). */
export async function assignStoreWorkspaceAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_ADMIN.includes(user.role)) {
    return { error: "Sem permissão para mover lojas." };
  }

  const parsed = assignWorkspaceSchema.safeParse({
    storeId: formData.get("storeId"),
    workspaceId: formData.get("workspaceId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { storeId, workspaceId: targetWsId } = parsed.data;

  await connectToDatabase();

  const store = await Store.findOne({ _id: storeId, deletedAt: null });
  if (!store) return { error: "Loja não encontrada." };

  const sourceWsId = String(store.workspaceId);
  if (targetWsId === sourceWsId) {
    return { ok: true };
  }

  const canManage = async (wsId: string) => {
    const m = await Membership.findOne({
      userId: user.id,
      workspaceId: wsId,
      status: "active",
      role: { $in: ["owner", "admin"] },
    });
    return Boolean(m);
  };

  if (!(await canManage(sourceWsId)) || !(await canManage(targetWsId))) {
    return { error: "Sem permissão para mover entre estes workspaces." };
  }

  await Store.updateOne({ _id: storeId }, { $set: { workspaceId: targetWsId } });
  await Order.updateMany({ storeId }, { $set: { workspaceId: targetWsId } });
  await Payout.updateMany({ storeId }, { $set: { workspaceId: targetWsId } });
  await BalanceTransaction.updateMany(
    { storeId },
    { $set: { workspaceId: targetWsId } },
  );

  revalidatePath("/", "layout");
  return { ok: true };
}
