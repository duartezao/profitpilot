import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import {
  GOOGLE_SHEETS_OAUTH_SCOPES,
  isGoogleOAuthConfigured,
  resolveGoogleOAuthRedirectUri,
} from "@/lib/google-oauth";
import { oauthCookieOptions } from "@/lib/ad-oauth";
import {
  GOOGLE_SHEETS_OAUTH_RETURN_COOKIE,
  GOOGLE_SHEETS_OAUTH_STATE_COOKIE,
} from "@/lib/google-sheets-oauth";

const STATE_COOKIE = GOOGLE_SHEETS_OAUTH_STATE_COOKIE;
const RETURN_COOKIE = GOOGLE_SHEETS_OAUTH_RETURN_COOKIE;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.workspaceId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const redirectUri = resolveGoogleOAuthRedirectUri(request);

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo")?.trim() || "/metricas";
  const store = searchParams.get("store")?.trim();

  if (!isGoogleOAuthConfigured(request) || !clientId || !redirectUri) {
    const dest = new URL(returnTo, request.url);
    if (store) dest.searchParams.set("store", store);
    dest.searchParams.set("sheets_oauth_error", "google_config");
    return NextResponse.redirect(dest);
  }

  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, oauthCookieOptions(600));
  const returnPath = store ? `${returnTo}?store=${store}` : returnTo;
  jar.set(RETURN_COOKIE, returnPath, oauthCookieOptions(600));

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SHEETS_OAUTH_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent select_account");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
