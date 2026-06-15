import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const META_OAUTH_STATE = "meta_oauth_state";
const META_OAUTH_STORE = "meta_oauth_store";
const META_OAUTH_COOKIE = "meta_oauth_token";

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
  const error = searchParams.get("error_description") ?? searchParams.get("error");

  const jar = await cookies();
  const expectedState = jar.get(META_OAUTH_STATE)?.value;
  const storeId = jar.get(META_OAUTH_STORE)?.value ?? "";
  jar.delete(META_OAUTH_STATE);
  jar.delete(META_OAUTH_STORE);

  if (error || !code) {
    const dest = new URL("/anuncios", request.url);
    if (storeId) dest.searchParams.set("store", storeId);
    dest.hash = "contas-ads";
    dest.searchParams.set("oauth_error", error ?? "cancelled");
    return NextResponse.redirect(dest);
  }

  if (!state || state !== expectedState) {
    const dest = new URL("/anuncios", request.url);
    if (storeId) dest.searchParams.set("store", storeId);
    dest.hash = "contas-ads";
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

  const dest = new URL("/anuncios", request.url);
  if (storeId) dest.searchParams.set("store", storeId);
  dest.hash = "contas-ads";

  if (!res.ok || !json.access_token) {
    dest.searchParams.set(
      "oauth_error",
      json.error?.message ?? "token",
    );
    return NextResponse.redirect(dest);
  }

  jar.set(META_OAUTH_COOKIE, json.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });
  dest.searchParams.set("oauth", "meta");
  return NextResponse.redirect(dest);
}
