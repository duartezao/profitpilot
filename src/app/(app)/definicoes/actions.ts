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
import {
  isValidSessionCountries,
  mirrorSessionCountry,
  normalizeSessionCountries,
  sessionCountryKeysFromStore,
} from "@/lib/shopify-countries";
import { invalidateWorkspaceMetricsCache } from "@/lib/metrics-summary-cache";
import {
  invalidateSessionMetricsForCountries,
  syncSessionMetricsForStore,
} from "@/lib/session-metrics";
import { isMyshopifyDomain, normalizeDisplayUrl } from "@/lib/store-display";
import { assertStoreAccess, findStoreForUser } from "@/lib/store-scope";
import {
  COGS_MODES,
  COGS_INPUT_CURRENCIES,
  isCogsInputCurrency,
  isCogsMode,
} from "@/lib/cogs-modes";
import { resolveCogsModeForStoreSessionCountries } from "@/lib/session-cogs-policy";
import { parseLocaleNumberOrZero } from "@/lib/parse-number";

export type SettingsState = { ok?: boolean; error?: string };

const ROLES_ADMIN = ["owner", "admin"];
const ROLES_EDIT = ["owner", "admin", "editor"];

const numOpt = (v: FormDataEntryValue | null) => parseLocaleNumberOrZero(v);

const workspaceSchema = z.object({
  name: z.string().trim().min(1, "Dá um nome ao workspace."),
  baseCurrency: z.string().trim().length(3, "Moeda em formato ISO (ex.: EUR)."),
  taxReservePercent: z.number().min(0).max(100),
  netMarginMin: z.number(),
  refundRateMax: z.number(),
  chargebackRateMax: z.number(),
  poasMin: z.number().min(0),
  refundWindowDays: z.number().min(1).max(365),
  monthlyRevenueGoal: z.number().min(0).optional(),
  monthlyProfitGoal: z.number().min(0).optional(),
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
    poasMin: numOpt(formData.get("poasMin")),
    refundWindowDays: numOpt(formData.get("refundWindowDays")),
    monthlyRevenueGoal: numOpt(formData.get("monthlyRevenueGoal")) || undefined,
    monthlyProfitGoal: numOpt(formData.get("monthlyProfitGoal")) || undefined,
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
        "targets.poasMin": d.poasMin,
        "targets.monthlyRevenueGoal": d.monthlyRevenueGoal ?? null,
        "targets.monthlyProfitGoal": d.monthlyProfitGoal ?? null,
        refundWindowDays: d.refundWindowDays,
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
  startingBalance: z.number(),
  startingBalanceDate: z.string().trim(),
  analyticsSessionCountries: z.array(z.string()),
  displayUrl: z
    .string()
    .trim()
    .min(1, "Indica o URL público da loja.")
    .refine(
      (v) => !isMyshopifyDomain(v),
      "Usa o domínio público (.com), não o .myshopify.com.",
    ),
  cogsMode: z.enum(COGS_MODES).optional(),
  cogsInputCurrency: z.enum(COGS_INPUT_CURRENCIES).optional(),
  externalGatewayPayoutBusinessDays: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    },
    z.number().int().min(0).max(60).nullable(),
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
    startingBalance: numOpt(formData.get("startingBalance")),
    startingBalanceDate: String(formData.get("startingBalanceDate") ?? ""),
    analyticsSessionCountries: formData
      .getAll("analyticsSessionCountries")
      .map((v) => String(v).trim())
      .filter(Boolean),
    displayUrl: String(formData.get("displayUrl") ?? ""),
    cogsMode: String(formData.get("cogsMode") ?? ""),
    cogsInputCurrency: String(formData.get("cogsInputCurrency") ?? ""),
    externalGatewayPayoutBusinessDays:
      formData.get("externalGatewayPayoutBusinessDays") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  if (!isValidSessionCountries(d.analyticsSessionCountries)) {
    return { error: "País de sessões inválido." };
  }
  const analyticsSessionCountries = normalizeSessionCountries(
    d.analyticsSessionCountries,
  );
  const analyticsSessionCountry = mirrorSessionCountry(
    analyticsSessionCountries,
  );
  const requestedCogsMode = isCogsMode(d.cogsMode ?? "")
    ? d.cogsMode
    : undefined;
  const cogsInputCurrency = isCogsInputCurrency(d.cogsInputCurrency ?? "")
    ? d.cogsInputCurrency
    : undefined;
  const startingBalanceDate = d.startingBalanceDate
    ? new Date(d.startingBalanceDate)
    : null;

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    d.storeId,
    "_id analyticsSessionCountry analyticsSessionCountries platform cogsMode cogsDayFromKey cogsModePriorToDayForce",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  const { mode: cogsMode, forceDay, cogsDayFromKey } =
    await resolveCogsModeForStoreSessionCountries(
      d.storeId,
      analyticsSessionCountries,
      requestedCogsMode ?? (store.cogsMode as typeof requestedCogsMode),
    );

  const previousKeys = sessionCountryKeysFromStore(store);
  const nextKeys = analyticsSessionCountries;
  const prevSet = new Set(previousKeys);
  const nextSet = new Set(nextKeys);
  const removedOrChanged = [
    ...previousKeys.filter((k) => !nextSet.has(k)),
    ...nextKeys.filter((k) => !prevSet.has(k)),
  ];
  // Mundo ↔ países também muda a chave ""
  const worldChanged =
    (previousKeys.length === 0) !== (nextKeys.length === 0);
  const countriesChanged =
    worldChanged ||
    removedOrChanged.length > 0 ||
    previousKeys.join(",") !== nextKeys.join(",");

  const priorMode =
    store.cogsModePriorToDayForce ??
    (store.cogsMode && store.cogsMode !== "day" ? store.cogsMode : "shopify");

  const res = await Store.updateOne(
    { _id: d.storeId, workspaceId: user.workspaceId, deletedAt: null },
    {
      $set: {
        name: d.name,
        status: d.status,
        autoSync: d.status === "archived" ? false : d.autoSync,
        startingBalance: d.startingBalance,
        startingBalanceDate,
        analyticsSessionCountry,
        analyticsSessionCountries,
        displayUrl: normalizeDisplayUrl(d.displayUrl),
        cogsMode,
        ...(forceDay && cogsDayFromKey
          ? {
              cogsDayFromKey: store.cogsDayFromKey || cogsDayFromKey,
              cogsModePriorToDayForce: priorMode,
            }
          : {}),
        ...(cogsInputCurrency ? { cogsInputCurrency } : {}),
        externalGatewayPayoutBusinessDays: d.externalGatewayPayoutBusinessDays,
      },
    },
  );
  if (res.matchedCount === 0) {
    return { error: "Loja não encontrada." };
  }

  if (countriesChanged) {
    const toInvalidate = worldChanged
      ? ["", ...previousKeys, ...nextKeys]
      : removedOrChanged;
    await invalidateSessionMetricsForCountries(
      d.storeId,
      [...new Set(toInvalidate)],
    );
    invalidateWorkspaceMetricsCache(user.workspaceId);
    if (store.platform === "shopify") {
      void syncSessionMetricsForStore(d.storeId).catch(() => {});
    }
  } else {
    invalidateWorkspaceMetricsCache(user.workspaceId);
  }

  revalidatePath("/definicoes");
  revalidatePath("/lojas");
  revalidatePath("/dashboard");
  revalidatePath("/cogs");
  revalidatePath("/financas");
  revalidatePath("/tesouraria");
  revalidatePath("/payouts");
  revalidatePath("/metricas");
  revalidatePath("/", "layout");
  return { ok: true };
}

const removeBankrollSchema = z.object({
  storeId: z.string().trim().min(1),
  confirm: z.literal("yes", {
    message: "Confirma a remoção da banca antes de continuar.",
  }),
});

/** Remove o saldo inicial (banca) da loja — a tesouraria deixa de contar esse valor. */
export async function removeStoreBankrollAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar lojas." };
  }

  const parsed = removeBankrollSchema.safeParse({
    storeId: formData.get("storeId"),
    confirm: formData.get("confirm") === "on" ? "yes" : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await connectToDatabase();
  const store = await findStoreForUser(
    user,
    parsed.data.storeId,
    "startingBalance startingBalanceDate",
  );
  if (!store) return { error: "Loja não encontrada ou sem acesso." };

  const balance = (store as { startingBalance?: number }).startingBalance ?? 0;
  const balanceDate = (store as { startingBalanceDate?: Date | null })
    .startingBalanceDate;
  if (balance === 0 && !balanceDate) {
    return { error: "Esta loja já não tem banca definida." };
  }

  await Store.updateOne(
    { _id: parsed.data.storeId, workspaceId: user.workspaceId, deletedAt: null },
    { $set: { startingBalance: 0, startingBalanceDate: null } },
  );

  revalidatePath("/definicoes");
  revalidatePath("/financas");
  revalidatePath("/tesouraria");
  revalidatePath("/dashboard");
  revalidatePath("/metricas");
  revalidatePath("/", "layout");
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

  try {
    assertStoreAccess(user.storeAccess, storeId);
  } catch {
    return { error: "Sem acesso a esta loja." };
  }

  const store = await Store.findOne({
    _id: storeId,
    workspaceId: user.workspaceId,
    deletedAt: null,
  });
  if (!store) return { error: "Loja não encontrada neste workspace." };

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
