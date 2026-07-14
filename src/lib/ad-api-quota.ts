import "server-only";

/** Erros de quota/rate-limit das APIs Google/Meta/TikTok. */
export function isAdApiQuotaExhaustedMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("resource has been exhausted") ||
    m.includes("resource_exhausted") ||
    m.includes("resource_temporarily_exhausted") ||
    m.includes("rate limit") ||
    m.includes("too many requests")
  );
}

export function isStoreAdApiQuotaPaused(
  accounts: Array<{ lastSyncError?: string | null }>,
): boolean {
  return accounts.some(
    (a) => a.lastSyncError && isAdApiQuotaExhaustedMessage(a.lastSyncError),
  );
}
