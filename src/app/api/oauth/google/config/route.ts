import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveGoogleOAuthRedirectUri } from "@/lib/google-oauth";
import {
  googleAdsServerConfigStatus,
  probeGoogleAdsApiAccess,
} from "@/lib/google-ads";
import { getWorkspaceGoogleRefreshToken } from "@/lib/ad-platform-credentials";
import { authErrorResponse } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

/** Diagnóstico OAuth / Google Ads API (requer sessão). */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.workspaceId) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const redirectUri = resolveGoogleOAuthRedirectUri(request);
    const explicit = Boolean(process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI?.trim());
    const google = googleAdsServerConfigStatus();
    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get("credentialId")?.trim() ?? "";

    let apiProbe: { ok: boolean; error?: string } | undefined;
    if (google.apiReady && searchParams.get("probe") === "1" && credentialId) {
      const cred = await getWorkspaceGoogleRefreshToken(
        user.workspaceId,
        credentialId,
      );
      if (cred) {
        apiProbe = await probeGoogleAdsApiAccess(cred.refreshToken);
      } else {
        apiProbe = { ok: false, error: "Login Google não encontrado." };
      }
    }

    return NextResponse.json({
      redirectUri,
      source: explicit
        ? "GOOGLE_ADS_OAUTH_REDIRECT_URI"
        : "request origin",
      ...google,
      oauthReady:
        google.clientIdConfigured &&
        google.clientSecretConfigured &&
        Boolean(redirectUri),
      apiProbe,
      hint:
        "OAuth: client id + secret + redirectUri. API: GOOGLE_ADS_DEVELOPER_TOKEN + versão (GOOGLE_ADS_API_VERSION, default v23). Na Vercel: redeploy após adicionar variáveis.",
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
