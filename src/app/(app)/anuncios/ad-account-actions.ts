"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import mongoose from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createAdAccount, softDeleteAdAccount, updateAdAccountApiFees } from "@/lib/ad-accounts";
import { AD_PLATFORMS, type AdPlatform } from "@/lib/ad-spend-platforms";
import { assertStoreAccess, findStoreForUser } from "@/lib/store-scope";
import { syncAdAccountsSpendForStore } from "@/lib/ad-api-sync";
import {
  listMetaAdAccounts,
  MetaApiError,
  verifyMetaAdAccountAccess,
  type MetaAdAccountOption,
} from "@/lib/meta-ads";
import {
  GoogleAdsApiError,
  listGoogleAdAccounts,
  verifyGoogleAdAccountAccess,
  type GoogleAdAccountOption,
} from "@/lib/google-ads";
import {
  listTiktokAdvertisers,
  TiktokAdsApiError,
  verifyTiktokAdvertiserAccess,
  type TiktokAdvertiserOption,
} from "@/lib/tiktok-ads";
import {
  adOAuthLoginEmailCookie,
  adOAuthTokenCookie,
  legacyOAuthTokenCookie,
} from "@/lib/ad-oauth";

export type AdAccountActionState = { ok?: boolean; error?: string };

export type AdOAuthPending = {
  token: string;
  loginEmail?: string;
};

export type AdAccountsDiscoverState = {
  platform?: AdPlatform;
  meta?: MetaAdAccountOption[];
  google?: GoogleAdAccountOption[];
  tiktok?: TiktokAdvertiserOption[];
  error?: string;
};

const ROLES_EDIT = ["owner", "admin", "editor"];

const addSchema = z
  .object({
    platform: z.enum(AD_PLATFORMS),
    externalAccountId: z.string().trim().min(3).max(64),
    accountName: z.string().trim().max(120).optional(),
    accessToken: z.string().trim().optional(),
    refreshToken: z.string().trim().optional(),
    allocation: z.coerce.number().min(1).max(100).optional(),
    apiExtraFeeFixed: z.coerce.number().min(0).optional(),
    apiAgencyFeePercent: z.coerce.number().min(0).max(100).optional(),
    linkedLoginEmail: z.string().trim().max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.platform === "google") {
      if (!data.refreshToken || data.refreshToken.length < 10) {
        ctx.addIssue({
          code: "custom",
          message: "Indica um refresh token Google válido.",
          path: ["refreshToken"],
        });
      }
    } else if (!data.accessToken || data.accessToken.length < 10) {
      ctx.addIssue({
        code: "custom",
        message: "Indica um access token válido.",
        path: ["accessToken"],
      });
    }
  });

async function verifyPlatformAccount(
  platform: AdPlatform,
  externalAccountId: string,
  accessToken?: string,
  refreshToken?: string,
): Promise<{ name: string; currency: string }> {
  switch (platform) {
    case "meta":
      return verifyMetaAdAccountAccess(accessToken!, externalAccountId);
    case "google":
      return verifyGoogleAdAccountAccess(refreshToken!, externalAccountId);
    case "tiktok":
      return verifyTiktokAdvertiserAccess(accessToken!, externalAccountId);
    default:
      throw new Error("Plataforma inválida.");
  }
}

export async function addAdAccountAction(
  _prev: AdAccountActionState,
  formData: FormData,
): Promise<AdAccountActionState> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão para editar." };
  }

  const storeId = String(formData.get("storeId") ?? "").trim();
  if (!mongoose.isValidObjectId(storeId)) {
    return { error: "Loja inválida." };
  }
  assertStoreAccess(user.storeAccess, storeId);

  const parsed = addSchema.safeParse({
    platform: formData.get("platform"),
    externalAccountId: formData.get("externalAccountId"),
    accountName: formData.get("accountName") || undefined,
    accessToken: formData.get("accessToken") || undefined,
    refreshToken: formData.get("refreshToken") || undefined,
    allocation: formData.get("allocation") || 100,
    apiExtraFeeFixed: formData.get("apiExtraFeeFixed") || 0,
    apiAgencyFeePercent: formData.get("apiAgencyFeePercent") || 0,
    linkedLoginEmail: formData.get("linkedLoginEmail") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await connectToDatabase();
  const store = await findStoreForUser(user, storeId, "_id");
  if (!store) return { error: "Loja não encontrada." };

  const {
    platform,
    externalAccountId,
    accountName,
    accessToken,
    refreshToken,
    allocation,
    apiExtraFeeFixed,
    apiAgencyFeePercent,
    linkedLoginEmail,
  } = parsed.data;

  const replaceOther =
    String(formData.get("replacePlatformAccount") ?? "") === "true";

  try {
    const verified = await verifyPlatformAccount(
      platform,
      externalAccountId,
      accessToken,
      refreshToken,
    );
    const credentials =
      platform === "google"
        ? { refreshToken: refreshToken!.trim() }
        : { accessToken: accessToken!.trim() };

    await createAdAccount({
      workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
      storeId: store._id,
      platform,
      externalAccountId,
      accountName: accountName || verified.name,
      credentials,
      allocation,
      apiExtraFeeFixed: apiExtraFeeFixed ?? 0,
      apiAgencyFeePercent: apiAgencyFeePercent ?? 0,
      linkedLoginEmail: linkedLoginEmail ?? "",
      replaceOtherOnPlatform: replaceOther,
    });
    try {
      await syncAdAccountsSpendForStore(storeId);
    } catch {
      /* sync opcional após ligar */
    }
    revalidatePath("/anuncios");
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof MetaApiError ||
      e instanceof GoogleAdsApiError ||
      e instanceof TiktokAdsApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Não foi possível guardar.";
    if (msg.includes("duplicate key")) {
      return { error: "Esta conta já está ligada a esta loja." };
    }
    return { error: msg };
  }
}

/** Lista contas acessíveis com o token (passo 1 do assistente). */
export async function discoverAdAccountsAction(
  platform: AdPlatform,
  token: string,
): Promise<AdAccountsDiscoverState> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão." };
  }

  const trimmed = token.trim();
  if (trimmed.length < 10) {
    return { error: "Indica um token válido." };
  }

  try {
    if (platform === "meta") {
      const accounts = await listMetaAdAccounts(trimmed);
      if (!accounts.length) {
        return {
          error:
            "Nenhuma ad account Meta encontrada. Confirma ads_read e acesso no Business Manager.",
        };
      }
      return { platform, meta: accounts };
    }
    if (platform === "google") {
      const accounts = await listGoogleAdAccounts(trimmed);
      if (!accounts.length) {
        return {
          error: "Nenhuma conta Google Ads encontrada com este refresh token.",
        };
      }
      return { platform, google: accounts };
    }
    const accounts = await listTiktokAdvertisers(trimmed);
    if (!accounts.length) {
      return { error: "Nenhum advertiser TikTok encontrado com este token." };
    }
    return { platform: "tiktok", tiktok: accounts };
  } catch (e) {
    const msg =
      e instanceof MetaApiError ||
      e instanceof GoogleAdsApiError ||
      e instanceof TiktokAdsApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Não foi possível listar contas.";
    return { error: msg };
  }
}

/** @deprecated usar discoverAdAccountsAction */
export async function listMetaAdAccountsAction(
  accessToken: string,
): Promise<{ accounts?: MetaAdAccountOption[]; error?: string }> {
  const res = await discoverAdAccountsAction("meta", accessToken);
  return { accounts: res.meta, error: res.error };
}

export async function deleteAdAccountAction(
  _prev: AdAccountActionState,
  formData: FormData,
): Promise<AdAccountActionState> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão." };
  }

  const accountId = String(formData.get("accountId") ?? "").trim();
  if (!accountId) return { error: "Conta em falta." };

  const ok = await softDeleteAdAccount(user.workspaceId, accountId);
  if (!ok) return { error: "Conta não encontrada." };
  revalidatePath("/anuncios");
  return { ok: true };
}

export async function syncAdAccountsNowAction(
  storeId: string,
): Promise<AdAccountActionState> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { error: "Sessão inválida." };
  assertStoreAccess(user.storeAccess, storeId);
  try {
    await syncAdAccountsSpendForStore(storeId);
    revalidatePath("/anuncios");
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha ao sincronizar ads.",
    };
  }
}

const META_OAUTH_COOKIE = legacyOAuthTokenCookie("meta");
const GOOGLE_OAUTH_COOKIE = legacyOAuthTokenCookie("google");

async function consumeOAuthPending(
  platform: "meta" | "google",
  storeId: string,
): Promise<AdOAuthPending | null> {
  if (!mongoose.isValidObjectId(storeId)) return null;

  const user = await getCurrentUser();
  if (!user?.workspaceId) return null;
  assertStoreAccess(user.storeAccess, storeId);

  const jar = await cookies();
  const scopedCookie = adOAuthTokenCookie(platform, storeId);
  let token = jar.get(scopedCookie)?.value ?? null;
  if (token) {
    jar.delete(scopedCookie);
  } else {
    const legacy =
      platform === "meta" ? META_OAUTH_COOKIE : GOOGLE_OAUTH_COOKIE;
    token = jar.get(legacy)?.value ?? null;
    if (token) jar.delete(legacy);
  }
  if (!token) return null;

  const emailCookie = adOAuthLoginEmailCookie(platform, storeId);
  const loginEmail = jar.get(emailCookie)?.value?.trim() || undefined;
  jar.delete(emailCookie);

  return { token, loginEmail };
}

/** Lê token Meta guardado após OAuth desta loja (consumido uma vez). */
export async function consumeMetaOAuthTokenAction(
  storeId: string,
): Promise<AdOAuthPending | null> {
  return consumeOAuthPending("meta", storeId);
}

/** Lê refresh token Google guardado após OAuth desta loja (consumido uma vez). */
export async function consumeGoogleOAuthTokenAction(
  storeId: string,
): Promise<AdOAuthPending | null> {
  return consumeOAuthPending("google", storeId);
}

export async function updateAdAccountFeesAction(
  _prev: AdAccountActionState,
  formData: FormData,
): Promise<AdAccountActionState> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão." };
  }

  const accountId = String(formData.get("accountId") ?? "").trim();
  const apiExtraFeeFixed = Number(formData.get("apiExtraFeeFixed") ?? 0);
  const apiAgencyFeePercent = Number(formData.get("apiAgencyFeePercent") ?? 0);

  if (!accountId) return { error: "Conta em falta." };
  if (apiExtraFeeFixed < 0 || apiAgencyFeePercent < 0 || apiAgencyFeePercent > 100) {
    return { error: "Fees inválidas." };
  }

  const ok = await updateAdAccountApiFees(user.workspaceId, accountId, {
    apiExtraFeeFixed,
    apiAgencyFeePercent,
  });
  if (!ok) return { error: "Conta não encontrada." };

  revalidatePath("/anuncios");
  return { ok: true };
}
