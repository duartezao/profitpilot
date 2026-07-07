import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveGoogleOAuthRedirectUri } from "@/lib/google-oauth";
import { authErrorResponse } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

/** Mostra o redirect URI que a app envia ao Google (para configurar no Cloud Console). */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.workspaceId) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const redirectUri = resolveGoogleOAuthRedirectUri(request);
    const explicit = Boolean(process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI?.trim());

    return NextResponse.json({
      redirectUri,
      source: explicit
        ? "GOOGLE_ADS_OAUTH_REDIRECT_URI"
        : "request origin",
      clientIdConfigured: Boolean(process.env.GOOGLE_ADS_CLIENT_ID?.trim()),
      hint:
        "Adiciona redirectUri exactamente em Google Cloud → Credentials → OAuth client → Authorized redirect URIs.",
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
