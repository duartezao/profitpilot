import "server-only";
import mongoose from "mongoose";

export type AdOAuthPlatform = "meta" | "google";

const LEGACY_TOKEN_COOKIES: Record<AdOAuthPlatform, string> = {
  meta: "meta_oauth_token",
  google: "google_oauth_refresh",
};

/** Cookie httpOnly com o token OAuth pendente — uma por loja e plataforma. */
export function adOAuthTokenCookie(
  platform: AdOAuthPlatform,
  storeId: string,
): string {
  const safe = storeId.replace(/[^a-f0-9]/gi, "");
  return platform === "google"
    ? `google_oauth_refresh_${safe}`
    : `meta_oauth_token_${safe}`;
}

export function adOAuthLoginEmailCookie(
  platform: AdOAuthPlatform,
  storeId: string,
): string {
  const safe = storeId.replace(/[^a-f0-9]/gi, "");
  return platform === "google"
    ? `google_oauth_login_${safe}`
    : `meta_oauth_login_${safe}`;
}

export function adOAuthStateCookie(platform: AdOAuthPlatform): string {
  return `ad_oauth_state_${platform}`;
}

export function adOAuthStoreCookie(platform: AdOAuthPlatform): string {
  return `ad_oauth_store_${platform}`;
}

export function parseOAuthStoreId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || !mongoose.isValidObjectId(trimmed)) return null;
  return trimmed;
}

export function oauthCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: maxAgeSeconds,
    path: "/",
  };
}

export function legacyOAuthTokenCookie(platform: AdOAuthPlatform): string {
  return LEGACY_TOKEN_COOKIES[platform];
}
