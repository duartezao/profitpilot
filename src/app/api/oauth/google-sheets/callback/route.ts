import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import {
  resolveGoogleOAuthLoginEmail,
  resolveGoogleSheetsOAuthRedirectUri,
} from "@/lib/google-oauth";
import { oauthCookieOptions } from "@/lib/ad-oauth";
import { upsertWorkspaceGoogleSheetsCredential } from "@/lib/ad-platform-credentials";

const STATE_COOKIE = "google_sheets_oauth_state";
const RETURN_COOKIE = "google_sheets_oauth_return";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const redirectUri = resolveGoogleSheetsOAuthRedirectUri(request);

  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  const returnPath = jar.get(RETURN_COOKIE)?.value ?? "/metricas";
  jar.delete(STATE_COOKIE);
  jar.delete(RETURN_COOKIE);

  const dest = new URL(returnPath, request.url);

  if (!clientId || !clientSecret || !redirectUri) {
    dest.searchParams.set("sheets_oauth_error", "google_config");
    return NextResponse.redirect(dest);
  }

  const user = await getCurrentUser();
  if (!user?.workspaceId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error =
    searchParams.get("error_description") ?? searchParams.get("error");

  if (error || !code) {
    dest.searchParams.set("sheets_oauth_error", error ?? "cancelled");
    return NextResponse.redirect(dest);
  }

  if (!state || state !== expectedState) {
    dest.searchParams.set("sheets_oauth_error", "state");
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
    id_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.refresh_token) {
    dest.searchParams.set(
      "sheets_oauth_error",
      json.error_description ??
        json.error ??
        "Sem refresh token — tenta outra vez e aceita todas as permissões.",
    );
    return NextResponse.redirect(dest);
  }

  const loginEmail = await resolveGoogleOAuthLoginEmail(json);
  if (!loginEmail) {
    dest.searchParams.set("sheets_oauth_error", "email");
    return NextResponse.redirect(dest);
  }

  try {
    await upsertWorkspaceGoogleSheetsCredential(
      user.workspaceId,
      loginEmail,
      json.refresh_token,
    );
  } catch {
    dest.searchParams.set("sheets_oauth_error", "save_failed");
    return NextResponse.redirect(dest);
  }

  dest.searchParams.set("sheets_oauth", "ok");
  return NextResponse.redirect(dest);
}
