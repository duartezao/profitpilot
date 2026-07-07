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
  googleAdsServerConfigStatus,
  isGooglePermissionError,
  listGoogleAdAccounts,
  resolveGoogleCustomerIdLocal,
  resolveGoogleLoginCustomerId,
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
import {
  getWorkspaceGoogleRefreshToken,
  saveWorkspaceGoogleCredentialManual,
  upsertWorkspaceGoogleCredential,
} from "@/lib/ad-platform-credentials";

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
    googleCredentialId: z.string().trim().optional(),
    googleLoginCustomerId: z.string().trim().max(32).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.platform === "google") {
      const hasCredential =
        Boolean(data.googleCredentialId?.trim()) &&
        mongoose.isValidObjectId(data.googleCredentialId);
      const hasToken = Boolean(data.refreshToken && data.refreshToken.length >= 10);
      if (!hasCredential && !hasToken) {
        ctx.addIssue({
          code: "custom",
          message: "Escolhe um login Google do workspace ou indica refresh token.",
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
  googleLoginCustomerId?: string,
): Promise<{
  name: string;
  currency: string;
  externalAccountId?: string;
  loginCustomerId?: string;
}> {
  switch (platform) {
    case "meta":
      return verifyMetaAdAccountAccess(accessToken!, externalAccountId);
    case "google":
      if (!googleAdsServerConfigStatus().apiReady) {
        const local = resolveGoogleCustomerIdLocal(externalAccountId);
        return {
          name: local.name,
          currency: "EUR",
          externalAccountId: local.id,
        };
      }
      try {
        return await verifyGoogleAdAccountAccess(
          refreshToken!,
          externalAccountId,
          googleLoginCustomerId,
        );
      } catch (e) {
        const msg = e instanceof GoogleAdsApiError ? e.message : String(e);
        if (!isGooglePermissionError(msg)) throw e;

        let loginCustomerId: string | undefined;
        try {
          loginCustomerId = await resolveGoogleLoginCustomerId(
            refreshToken!,
            externalAccountId,
            googleLoginCustomerId,
          );
        } catch {
          /* ignora */
        }

        const local = resolveGoogleCustomerIdLocal(externalAccountId);
        return {
          name: local.name,
          currency: "EUR",
          externalAccountId: local.id,
          loginCustomerId,
        };
      }
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
    googleCredentialId: formData.get("googleCredentialId") || undefined,
    googleLoginCustomerId: formData.get("googleLoginCustomerId") || undefined,
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
    googleCredentialId,
    googleLoginCustomerId,
  } = parsed.data;

  let refreshTokenResolved = refreshToken?.trim() ?? "";
  let linkedEmailResolved = linkedLoginEmail ?? "";

  if (platform === "google" && googleCredentialId) {
    const cred = await getWorkspaceGoogleRefreshToken(
      user.workspaceId,
      googleCredentialId,
    );
    if (!cred) {
      return { error: "Login Google do workspace não encontrado." };
    }
    refreshTokenResolved = cred.refreshToken;
    if (!linkedEmailResolved) linkedEmailResolved = cred.loginEmail;
  }

  const replaceOther =
    String(formData.get("replacePlatformAccount") ?? "") === "true";

  try {
    const verified = await verifyPlatformAccount(
      platform,
      externalAccountId,
      accessToken,
      platform === "google" ? refreshTokenResolved : refreshToken,
      googleLoginCustomerId,
    );
    const externalIdResolved =
      verified.externalAccountId ?? externalAccountId.trim();
    const credentials =
      platform === "google"
        ? {
            refreshToken: refreshTokenResolved,
            ...(verified.loginCustomerId
              ? { loginCustomerId: verified.loginCustomerId }
              : {}),
          }
        : { accessToken: accessToken!.trim() };

    await createAdAccount({
      workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
      storeId: store._id,
      platform,
      externalAccountId: externalIdResolved,
      accountName: accountName || verified.name,
      credentials,
      allocation,
      apiExtraFeeFixed: apiExtraFeeFixed ?? 0,
      apiAgencyFeePercent: apiAgencyFeePercent ?? 0,
      linkedLoginEmail: linkedEmailResolved,
      replaceOtherOnPlatform: replaceOther,
    });
    try {
      await syncAdAccountsSpendForStore(storeId);
    } catch {
      /* sync opcional após ligar */
    }
    revalidatePath("/anuncios");
    revalidatePath("/definicoes");
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

/** Lista contas Google Ads com um login já guardado no workspace. */
export async function discoverGoogleCredentialAction(
  credentialId: string,
): Promise<AdAccountsDiscoverState> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão." };
  }
  const cred = await getWorkspaceGoogleRefreshToken(
    user.workspaceId,
    credentialId,
  );
  if (!cred) return { error: "Login Google não encontrado." };
  const res = await discoverAdAccountsAction("google", cred.refreshToken);
  if (res.error && cred.loginEmail) {
    return {
      error: `${res.error} (Gmail usado: ${cred.loginEmail})`,
    };
  }
  return res;
}

export async function saveWorkspaceGoogleLoginAction(
  _prev: AdAccountActionState,
  formData: FormData,
): Promise<AdAccountActionState> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão." };
  }

  const loginEmail = String(formData.get("loginEmail") ?? "").trim();
  const refreshToken = String(formData.get("refreshToken") ?? "").trim();
  if (!loginEmail || !refreshToken) {
    return { error: "Email e refresh token são obrigatórios." };
  }

  try {
    await saveWorkspaceGoogleCredentialManual(
      user.workspaceId,
      loginEmail,
      refreshToken,
    );
    revalidatePath("/anuncios");
    revalidatePath("/definicoes");
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Não foi possível guardar.",
    };
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
            "Nenhuma ad account Meta encontrada. Confirma ads_read, que o convite foi aceite, e que o token é do utilizador que recebeu o acesso (ou System User com permissão).",
        };
      }
      return { platform, meta: accounts };
    }
    if (platform === "google") {
      if (!googleAdsServerConfigStatus().apiReady) {
        return {
          error:
            "Pesquisa automática indisponível — falta GOOGLE_ADS_DEVELOPER_TOKEN na Vercel. Usa «Customer ID manual» com o ID da conta (ex: 962-828-5107).",
        };
      }
      const accounts = await listGoogleAdAccounts(trimmed);
      if (!accounts.length) {
        return {
          error:
            "Nenhuma conta Google Ads listada com este Gmail — confirma que é o mesmo que aceitou o convite, ou usa Customer ID manual.",
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
  revalidatePath("/definicoes");
  return { ok: true };
}

export async function deleteWorkspaceGoogleLoginAction(
  _prev: AdAccountActionState,
  formData: FormData,
): Promise<AdAccountActionState> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { error: "Sessão inválida." };
  if (!ROLES_EDIT.includes(user.role)) {
    return { error: "Sem permissão." };
  }

  const credentialId = String(formData.get("credentialId") ?? "").trim();
  if (!credentialId) return { error: "Login em falta." };

  const { softDeleteWorkspaceCredential } = await import(
    "@/lib/ad-platform-credentials"
  );
  const ok = await softDeleteWorkspaceCredential(
    user.workspaceId,
    credentialId,
    "google",
  );
  if (!ok) return { error: "Gmail não encontrado." };
  revalidatePath("/anuncios");
  revalidatePath("/definicoes");
  return { ok: true };
}

export async function syncAdAccountsNowAction(
  storeId: string,
): Promise<AdAccountActionState> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { error: "Sessão inválida." };
  assertStoreAccess(user.storeAccess, storeId);
  try {
    const { Store } = await import("@/models/Store");
    const { dateKeyInTimezone, normalizeStoreTimezone } =
      await import("@/lib/store-timezone");
    const store = await Store.findById(storeId).select("ianaTimezone").lean();
    const tz = normalizeStoreTimezone(store?.ianaTimezone);
    const today = dateKeyInTimezone(new Date(), tz);
    await syncAdAccountsSpendForStore(storeId, { campaignDateKeys: [today] });
    revalidatePath("/anuncios");
    revalidatePath("/definicoes");
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

  if (platform === "google" && token && loginEmail) {
    try {
      await upsertWorkspaceGoogleCredential(user.workspaceId, loginEmail, token);
    } catch {
      /* ignorar — cookie ainda serve nesta sessão */
    }
  }

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
