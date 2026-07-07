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
