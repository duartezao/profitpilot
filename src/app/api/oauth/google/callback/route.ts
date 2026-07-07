import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { resolveGoogleOAuthRedirectUri } from "@/lib/google-oauth";
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
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const redirectUri = resolveGoogleOAuthRedirectUri(request);
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(
      new URL("/anuncios?oauth_error=google_config", request.url),
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error =
    searchParams.get("error_description") ?? searchParams.get("error");

  const jar = await cookies();
  const expectedState = jar.get(adOAuthStateCookie("google"))?.value;
  const storeId = parseOAuthStoreId(jar.get(adOAuthStoreCookie("google"))?.value);
  jar.delete(adOAuthStateCookie("google"));
  jar.delete(adOAuthStoreCookie("google"));

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

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.refresh_token) {
    dest.searchParams.set(
      "oauth_error",
      json.error_description ??
        json.error ??
        "Sem refresh token — tenta outra vez e aceita todas as permissões.",
    );
    return NextResponse.redirect(dest);
  }

  let loginEmail = "";
  if (json.access_token) {
    try {
      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${json.access_token}` },
        cache: "no-store",
      });
      const info = (await infoRes.json()) as { email?: string };
      loginEmail = info.email?.trim() ?? "";
    } catch {
      /* opcional */
    }
  }

  const tokenCookie = adOAuthTokenCookie("google", storeId);
  jar.set(tokenCookie, json.refresh_token, oauthCookieOptions(300));
  jar.delete(legacyOAuthTokenCookie("google"));
  if (loginEmail) {
    jar.set(
      adOAuthLoginEmailCookie("google", storeId),
      loginEmail,
      oauthCookieOptions(300),
    );
  }

  dest.searchParams.set("oauth", "google");
  return NextResponse.redirect(dest);
}
