/** Origem pública do pedido (Vercel/proxy usa x-forwarded-*). */
export function resolveRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (host) {
    const hostClean = host.split(",")[0]?.trim();
    const protoRaw =
      request.headers.get("x-forwarded-proto") ??
      (hostClean.includes("localhost") ? "http" : "https");
    const proto = protoRaw.split(",")[0]?.trim() || "https";
    return `${proto}://${hostClean}`;
  }
  return new URL(request.url).origin;
}

/** Redirect URI OAuth Google — pedido actual, env explícito, ou NEXT_PUBLIC_APP_URL. */
export function resolveGoogleOAuthRedirectUri(request?: Request): string | null {
  const explicit = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  if (request) {
    return `${resolveRequestOrigin(request)}/api/oauth/google/callback`;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    return `${appUrl.replace(/\/$/, "")}/api/oauth/google/callback`;
  }

  return null;
}

export function isGoogleOAuthConfigured(request?: Request): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_CLIENT_ID?.trim() &&
      process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() &&
      resolveGoogleOAuthRedirectUri(request),
  );
}

/** Scopes OAuth: Ads API + email (para associar o Gmail ao workspace). */
export const GOOGLE_ADS_OAUTH_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/adwords",
].join(" ");

function emailFromIdToken(idToken: string): string {
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return "";
    const json = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { email?: string };
    return json.email?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Obtém o email do Gmail autorizado (userinfo ou id_token). */
export async function resolveGoogleOAuthLoginEmail(tokens: {
  access_token?: string;
  id_token?: string;
}): Promise<string> {
  if (tokens.id_token) {
    const fromId = emailFromIdToken(tokens.id_token);
    if (fromId) return fromId;
  }

  if (!tokens.access_token) return "";

  try {
    const infoRes = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
      },
    );
    if (infoRes.ok) {
      const info = (await infoRes.json()) as { email?: string };
      const email = info.email?.trim() ?? "";
      if (email) return email;
    }
  } catch {
    /* tenta fallback abaixo */
  }

  try {
    const legacyRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
      },
    );
    if (legacyRes.ok) {
      const info = (await legacyRes.json()) as { email?: string };
      return info.email?.trim() ?? "";
    }
  } catch {
    /* sem email */
  }

  return "";
}
