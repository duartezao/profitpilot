import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import {
  GOOGLE_ADS_OAUTH_SCOPES,
  resolveGoogleOAuthRedirectUri,
} from "@/lib/google-oauth";
import { assertStoreAccess } from "@/lib/store-scope";
import {
  adOAuthReturnCookie,
  adOAuthStateCookie,
  adOAuthStoreCookie,
  oauthCookieOptions,
  parseOAuthStoreId,
} from "@/lib/ad-oauth";

function anunciosDest(request: Request, storeId: string, extra?: Record<string, string>) {
  const dest = new URL("/anuncios", request.url);
  dest.searchParams.set("store", storeId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) dest.searchParams.set(k, v);
  }
  return dest;
}

function definicoesDest(request: Request, extra?: Record<string, string>) {
  const dest = new URL("/definicoes", request.url);
  dest.hash = "google-ads";
  if (extra) {
    for (const [k, v] of Object.entries(extra)) dest.searchParams.set(k, v);
  }
  return dest;
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const redirectUri = resolveGoogleOAuthRedirectUri(request);
  const { searchParams } = new URL(request.url);
  const storeId = parseOAuthStoreId(searchParams.get("store"));
  const returnTo = searchParams.get("returnTo")?.trim() ?? "";
  const toDefinicoes = returnTo === "definicoes";

  if (!storeId && !toDefinicoes) {
    return NextResponse.redirect(
      definicoesDest(request, { oauth_error: "store_required" }),
    );
  }

  const user = await getCurrentUser();
  if (!user?.workspaceId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (storeId) {
    try {
      assertStoreAccess(user.storeAccess, storeId);
    } catch {
      return NextResponse.redirect(
        anunciosDest(request, storeId, { oauth_error: "store_access" }),
      );
    }
  }

  if (!clientId || !redirectUri) {
    const err = !clientId ? "google_config_client_id" : "google_config_redirect";
    return NextResponse.redirect(
      toDefinicoes
        ? definicoesDest(request, { oauth_error: err })
        : anunciosDest(request, storeId!, { oauth_error: err }),
    );
  }

  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(adOAuthStateCookie("google"), state, oauthCookieOptions(600));
  if (storeId) {
    jar.set(adOAuthStoreCookie("google"), storeId, oauthCookieOptions(600));
  } else {
    jar.delete(adOAuthStoreCookie("google"));
  }
  if (toDefinicoes) {
    jar.set(adOAuthReturnCookie("google"), "definicoes", oauthCookieOptions(600));
  } else {
    jar.delete(adOAuthReturnCookie("google"));
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_ADS_OAUTH_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent select_account");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
