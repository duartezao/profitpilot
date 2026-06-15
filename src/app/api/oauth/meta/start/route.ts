import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const META_OAUTH_STATE = "meta_oauth_state";
const META_OAUTH_STORE = "meta_oauth_store";

export async function GET(request: Request) {
  const appId = process.env.META_APP_ID?.trim();
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim();
  if (!appId || !redirectUri) {
    return NextResponse.json(
      { error: "OAuth Meta não configurado (META_APP_ID, META_OAUTH_REDIRECT_URI)." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store")?.trim() ?? "";
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(META_OAUTH_STATE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  if (storeId) {
    jar.set(META_OAUTH_STORE, storeId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  }

  const scope = "ads_read,business_management";
  const authUrl = new URL(`https://www.facebook.com/v25.0/dialog/oauth`);
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("response_type", "code");

  return NextResponse.redirect(authUrl.toString());
}
