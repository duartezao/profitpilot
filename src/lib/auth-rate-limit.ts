import "server-only";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

function prune(now: number) {
  if (buckets.size < 500) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

/**
 * Rate limit simples em memória (por instância).
 * Conta só falhas — sucesso limpa o bucket.
 */
export function assertAuthRateLimit(key: string): void {
  const now = Date.now();
  prune(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    return;
  }
  if (existing.count >= MAX_ATTEMPTS) {
    throw new Error(
      "Demasiadas tentativas. Espera alguns minutos e tenta outra vez.",
    );
  }
}

/** Regista uma falha de login/registo. */
export function recordAuthRateLimitFailure(key: string): void {
  const now = Date.now();
  prune(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  existing.count += 1;
}

export function clearAuthRateLimit(key: string): void {
  buckets.delete(key);
}
