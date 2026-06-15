"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser, listManageableWorkspaces } from "@/lib/auth";
import { Membership } from "@/models/Membership";
import { encrypt } from "@/lib/crypto";
import {
  isMyshopifyDomain,
  normalizeDisplayUrl,
} from "@/lib/store-display";
import {
  testShopifyConnection,
  normalizeShopDomain,
  getClientCredentialsToken,
} from "@/lib/shopify";
import { syncStore } from "@/lib/shopify-sync";
import { Store } from "@/models/Store";
import { findStoreForUser } from "@/lib/store-scope";
import {
  COGS_MODES,
  defaultCogsInputCurrency,
  defaultCogsMode,
  isCogsInputCurrency,
  isCogsMode,
} from "@/lib/cogs-modes";

export type AddStoreState = { error?: string };
export type SyncState = { ok?: boolean; message?: string; error?: string };

const ROLES_THAT_CAN_EDIT = ["owner", "admin", "editor"];

const schema = z.object({
  name: z.string().trim().min(1, "Dá um nome à loja."),
  shopDomain: z
    .string()
    .trim()
    .min(1, "Indica o domínio .myshopify.com.")
    .refine(isMyshopifyDomain, "Tem de ser um domínio .myshopify.com."),
  displayUrl: z
    .string()
    .trim()
    .min(1, "Indica o URL público da loja (ex.: minhaloja.com).")
    .refine(
      (v) => !isMyshopifyDomain(v),
      "Usa o domínio público (.com), não o .myshopify.com.",
    ),
  clientId: z.string().trim().min(1, "Cola o ID de cliente (Client ID)."),
  clientSecret: z.string().trim().min(1, "Cola a Chave secreta (Client secret)."),
  importStartDate: z.string().trim().optional(),
  workspaceId: z.string().trim().optional(),
  cogsMode: z.enum(COGS_MODES).optional(),
  cogsInputCurrency: z.enum(["EUR", "USD"]).optional(),
});

export async function addStoreAction(
  _prev: AddStoreState,
  formData: FormData,
): Promise<AddStoreState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_THAT_CAN_EDIT.includes(user.role)) {
    return { error: "Não tens permissão para adicionar lojas." };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    shopDomain: formData.get("shopDomain"),
    displayUrl: formData.get("displayUrl"),
    clientId: formData.get("clientId"),
    clientSecret: formData.get("clientSecret"),
    importStartDate: formData.get("importStartDate") ?? "",
    workspaceId: formData.get("workspaceId") ?? "",
    cogsMode: String(formData.get("cogsMode") ?? ""),
    cogsInputCurrency: String(formData.get("cogsInputCurrency") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { name, shopDomain, displayUrl, clientId, clientSecret, importStartDate } =
    parsed.data;
  const cogsMode = isCogsMode(parsed.data.cogsMode ?? "")
    ? parsed.data.cogsMode
    : defaultCogsMode();
  const cogsInputCurrency = isCogsInputCurrency(
    parsed.data.cogsInputCurrency ?? "",
  )
    ? parsed.data.cogsInputCurrency
    : defaultCogsInputCurrency();

  // Obtém um token (client credentials) e testa a ligação antes de guardar.
  let shop;
  try {
    const token = await getClientCredentialsToken(
      shopDomain,
      clientId,
      clientSecret,
    );
    shop = await testShopifyConnection(shopDomain, token.accessToken);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha ao ligar à Shopify.",
    };
  }

  // Encripta as credenciais (client id/secret) num blob (AES-256-GCM).
  // O token é de curta duração e é obtido de novo em cada sincronização.
  let credentials: string;
  try {
    credentials = encrypt(JSON.stringify({ clientId, clientSecret }));
  } catch {
    return {
      error:
        "ENCRYPTION_KEY em falta ou inválida (32 bytes base64). Define-a no .env.",
    };
  }

  await connectToDatabase();

  const targetWorkspaceId =
    parsed.data.workspaceId?.trim() || user.workspaceId;
  const canAdd = await Membership.findOne({
    userId: user.id,
    workspaceId: targetWorkspaceId,
    status: "active",
    role: { $in: ["owner", "admin", "editor"] },
  });
  if (!canAdd) {
    return { error: "Sem permissão para adicionar lojas a este workspace." };
  }

  await Store.create({
    workspaceId: targetWorkspaceId,
    name,
    platform: "shopify",
    shopDomain: shop.myshopifyDomain || normalizeShopDomain(shopDomain),
    displayUrl: normalizeDisplayUrl(displayUrl),
    currency: shop.currencyCode || "EUR",
    cogsMode,
    cogsInputCurrency,
    credentials,
    importStartDate: importStartDate ? new Date(importStartDate) : undefined,
    ianaTimezone: shop.ianaTimezone || undefined,
    status: "active",
  });

  redirect("/lojas");
}

export async function syncStoreAction(
  _prev: SyncState,
  formData: FormData,
): Promise<SyncState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ROLES_THAT_CAN_EDIT.includes(user.role)) {
    return { error: "Sem permissão para sincronizar." };
  }

  const storeId = String(formData.get("storeId") ?? "");
  if (!storeId) return { error: "Loja inválida." };

  await connectToDatabase();
  const storeDoc = await findStoreForUser(user, storeId, "_id");
  if (!storeDoc) return { error: "Loja não encontrada ou sem acesso." };

  try {
    const r = await syncStore(storeId);
    revalidatePath("/lojas");
    revalidatePath("/dashboard");
    revalidatePath("/payouts");
    revalidatePath("/tesouraria");
    revalidatePath("/metricas");
    const sessionPart = r.sessionMetricsError
      ? `sessões: erro — ${r.sessionMetricsError}`
      : `${r.sessionMetricsDays} dia${r.sessionMetricsDays === 1 ? "" : "s"} de sessões`;
    return {
      ok: true,
      message: r.payoutsError
        ? `${r.orders} orders · ${r.products} produtos · ${sessionPart} · payouts: ${r.payoutsError}`
        : `${r.orders} orders · ${r.products} produtos · ${sessionPart} · ${r.payouts} payouts · ${r.balanceTransactions} pendentes`,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha na sincronização.",
    };
  }
}
