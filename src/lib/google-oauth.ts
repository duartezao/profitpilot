/** Redirect URI OAuth Google — pedido actual, env explícito, ou NEXT_PUBLIC_APP_URL. */
export function resolveGoogleOAuthRedirectUri(request?: Request): string | null {
  const explicit = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  // Usar o domínio do pedido evita redirect_uri_mismatch (local vs Vercel).
  if (request) {
    return `${new URL(request.url).origin}/api/oauth/google/callback`;
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
