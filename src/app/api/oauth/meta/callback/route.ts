import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { assertStoreAccess } from "@/lib/store-scope";
import {
  adOAuthLoginEmailCookie,
  adOAuthStateCookie,
  adOAuthStoreCookie,
  adOAuthTokenCookie,
  legacyOAuthTokenCookie,
  oauthCookieOptions,
  parseOAuthStoreId,
} from "@/lib/ad-oauth";

export async function GET(request: Request) {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim();
  if (!appId || !appSecret || !redirectUri) {
    return NextResponse.redirect(
      new URL("/anuncios?oauth_error=config", request.url),
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error =
    searchParams.get("error_description") ?? searchParams.get("error");

  const jar = await cookies();
  const expectedState = jar.get(adOAuthStateCookie("meta"))?.value;
  const storeId = parseOAuthStoreId(jar.get(adOAuthStoreCookie("meta"))?.value);
  jar.delete(adOAuthStateCookie("meta"));
  jar.delete(adOAuthStoreCookie("meta"));

  const dest = new URL("/anuncios", request.url);
  if (storeId) dest.searchParams.set("store", storeId);
  dest.hash = "contas-ads";

  if (!storeId) {
    dest.searchParams.set("oauth_error", "store_required");
    return NextResponse.redirect(dest);
  }

  const user = await getCurrentUser();
  if (!user?.workspaceId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  try {
    assertStoreAccess(user.storeAccess, storeId);
  } catch {
    dest.searchParams.set("oauth_error", "store_access");
    return NextResponse.redirect(dest);
  }

  if (error || !code) {
    dest.searchParams.set("oauth_error", error ?? "cancelled");
    return NextResponse.redirect(dest);
  }

  if (!state || state !== expectedState) {
    dest.searchParams.set("oauth_error", "state");
    return NextResponse.redirect(dest);
  }

  const tokenUrl = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const res = await fetch(tokenUrl, { cache: "no-store" });
  const json = (await res.json()) as {
    access_token?: string;
    error?: { message?: string };
  };

  if (!res.ok || !json.access_token) {
    dest.searchParams.set("oauth_error", json.error?.message ?? "token");
    return NextResponse.redirect(dest);
  }

  let loginEmail = "";
  try {
    const meRes = await fetch(
      `https://graph.facebook.com/v25.0/me?fields=email,name&access_token=${encodeURIComponent(json.access_token)}`,
      { cache: "no-store" },
    );
    const me = (await meRes.json()) as { email?: string };
    loginEmail = me.email?.trim() ?? "";
  } catch {
    /* opcional */
  }

  const tokenCookie = adOAuthTokenCookie("meta", storeId);
  jar.set(tokenCookie, json.access_token, oauthCookieOptions(300));
  jar.delete(legacyOAuthTokenCookie("meta"));
  if (loginEmail) {
    jar.set(
      adOAuthLoginEmailCookie("meta", storeId),
      loginEmail,
      oauthCookieOptions(300),
    );
  }

  dest.searchParams.set("oauth", "meta");
  return NextResponse.redirect(dest);
}
