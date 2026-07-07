import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { assertStoreAccess } from "@/lib/store-scope";
import {
  adOAuthStateCookie,
  adOAuthStoreCookie,
  oauthCookieOptions,
  parseOAuthStoreId,
} from "@/lib/ad-oauth";

function anunciosDest(
  request: Request,
  storeId: string,
  extra?: Record<string, string>,
) {
  const dest = new URL("/anuncios", request.url);
  dest.searchParams.set("store", storeId);
  dest.hash = "contas-ads";
  if (extra) {
    for (const [k, v] of Object.entries(extra)) dest.searchParams.set(k, v);
  }
  return dest;
}

export async function GET(request: Request) {
  const appId = process.env.META_APP_ID?.trim();
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim();
  const { searchParams } = new URL(request.url);
  const storeId = parseOAuthStoreId(searchParams.get("store"));

  if (!storeId) {
    const dest = new URL("/anuncios", request.url);
    dest.hash = "contas-ads";
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
    return NextResponse.redirect(
      anunciosDest(request, storeId, { oauth_error: "store_access" }),
    );
  }

  if (!appId || !redirectUri) {
    return NextResponse.redirect(
      anunciosDest(request, storeId, { oauth_error: "config" }),
    );
  }

  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(adOAuthStateCookie("meta"), state, oauthCookieOptions(600));
  jar.set(adOAuthStoreCookie("meta"), storeId, oauthCookieOptions(600));

  const scope = "ads_read,business_management";
  const authUrl = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("auth_type", "rerequest");

  return NextResponse.redirect(authUrl.toString());
}
