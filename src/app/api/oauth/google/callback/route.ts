import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import {
  resolveGoogleOAuthLoginEmail,
  resolveGoogleOAuthRedirectUri,
} from "@/lib/google-oauth";
import { assertStoreAccess } from "@/lib/store-scope";
import {
  adOAuthLoginEmailCookie,
  adOAuthReturnCookie,
  adOAuthStateCookie,
  adOAuthStoreCookie,
  adOAuthTokenCookie,
  legacyOAuthTokenCookie,
  oauthCookieOptions,
  parseOAuthStoreId,
} from "@/lib/ad-oauth";
import {
  upsertWorkspaceGoogleCredential,
  upsertWorkspaceGoogleSheetsCredential,
} from "@/lib/ad-platform-credentials";
import {
  GOOGLE_SHEETS_OAUTH_RETURN_COOKIE,
  GOOGLE_SHEETS_OAUTH_STATE_COOKIE,
} from "@/lib/google-sheets-oauth";

async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<{
  refresh_token?: string;
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return { error: "google_config" };
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

  return (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const redirectUri = resolveGoogleOAuthRedirectUri(request);
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(
      new URL("/definicoes?oauth_error=google_config#google-ads", request.url),
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error =
    searchParams.get("error_description") ?? searchParams.get("error");

  const jar = await cookies();

  /* --- Profit Sheet (Google Sheets) --- */
  const sheetsExpectedState = jar.get(GOOGLE_SHEETS_OAUTH_STATE_COOKIE)?.value;
  const sheetsReturnPath =
    jar.get(GOOGLE_SHEETS_OAUTH_RETURN_COOKIE)?.value ?? "/metricas";
  const isSheetsFlow = Boolean(
    sheetsExpectedState && state && state === sheetsExpectedState,
  );
  const sheetsFlowStarted = Boolean(
    sheetsExpectedState || jar.get(GOOGLE_SHEETS_OAUTH_RETURN_COOKIE)?.value,
  );

  if (sheetsFlowStarted && !isSheetsFlow) {
    jar.delete(GOOGLE_SHEETS_OAUTH_STATE_COOKIE);
    jar.delete(GOOGLE_SHEETS_OAUTH_RETURN_COOKIE);
    const dest = new URL(sheetsReturnPath, request.url);
    dest.searchParams.set("sheets_oauth_error", "state");
    return NextResponse.redirect(dest);
  }

  if (isSheetsFlow) {
    jar.delete(GOOGLE_SHEETS_OAUTH_STATE_COOKIE);
    jar.delete(GOOGLE_SHEETS_OAUTH_RETURN_COOKIE);

    const dest = new URL(sheetsReturnPath, request.url);

    const user = await getCurrentUser();
    if (!user?.workspaceId) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (error || !code) {
      dest.searchParams.set("sheets_oauth_error", error ?? "cancelled");
      return NextResponse.redirect(dest);
    }

    const json = await exchangeGoogleCode(code, redirectUri);
    if (!json.refresh_token) {
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

  /* --- Google Ads --- */
  const expectedState = jar.get(adOAuthStateCookie("google"))?.value;
  const storeId = parseOAuthStoreId(jar.get(adOAuthStoreCookie("google"))?.value);
  const returnTo = jar.get(adOAuthReturnCookie("google"))?.value ?? "";
  const toDefinicoes = returnTo === "definicoes" || !storeId;

  jar.delete(adOAuthStateCookie("google"));
  jar.delete(adOAuthStoreCookie("google"));
  jar.delete(adOAuthReturnCookie("google"));

  const dest = toDefinicoes
    ? new URL("/definicoes", request.url)
    : new URL("/anuncios", request.url);
  if (toDefinicoes) {
    dest.hash = "google-ads";
  } else if (storeId) {
    dest.searchParams.set("store", storeId);
  }

  const user = await getCurrentUser();
  if (!user?.workspaceId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (storeId && !toDefinicoes) {
    try {
      assertStoreAccess(user.storeAccess, storeId);
    } catch {
      dest.searchParams.set("oauth_error", "store_access");
      return NextResponse.redirect(dest);
    }
  }

  if (error || !code) {
    dest.searchParams.set("oauth_error", error ?? "cancelled");
    return NextResponse.redirect(dest);
  }

  if (!state || state !== expectedState) {
    dest.searchParams.set("oauth_error", "state");
    return NextResponse.redirect(dest);
  }

  const json = await exchangeGoogleCode(code, redirectUri);
  if (!json.refresh_token) {
    dest.searchParams.set(
      "oauth_error",
      json.error_description ??
        json.error ??
        "Sem refresh token — tenta outra vez e aceita todas as permissões.",
    );
    return NextResponse.redirect(dest);
  }

  const loginEmail = await resolveGoogleOAuthLoginEmail(json);
  if (!loginEmail) {
    dest.searchParams.set(
      "oauth_error",
      "Não foi possível obter o email do Gmail — autoriza de novo e aceita o acesso ao email.",
    );
    return NextResponse.redirect(dest);
  }

  try {
    await upsertWorkspaceGoogleCredential(
      user.workspaceId,
      loginEmail,
      json.refresh_token,
    );
  } catch {
    dest.searchParams.set("oauth_error", "save_failed");
    return NextResponse.redirect(dest);
  }

  if (storeId && !toDefinicoes) {
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
    dest.searchParams.set("google_login", "ok");
  } else {
    dest.searchParams.set("google_login", "ok");
  }

  return NextResponse.redirect(dest);
}
