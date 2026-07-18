import "server-only";

/** TTL curto — hits sem ir à BD; invalidações de sync limpam o Map. */
const DEFAULT_TTL_MS = 45_000;
const MAX_ENTRIES = 200;

type Entry = {
  expiresAt: number;
  value: unknown;
};

const cache = new Map<string, Entry>();

function remember(key: string, entry: Entry): void {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Limpa cache em processo (após invalidação de métricas / sync). */
export function clearRevisionMemoryCache(prefixOrIncludes?: string): void {
  if (!prefixOrIncludes) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (
      key.startsWith(prefixOrIncludes) ||
      key.includes(prefixOrIncludes)
    ) {
      cache.delete(key);
    }
  }
}

/**
 * Cache em memória por TTL (síncrono no hit).
 * Não consulta Mongo na leitura — só `clearRevisionMemoryCache` após sync.
 * `fresh` força recalcular e repõe o cache.
 */
export async function withRevisionMemoryCache<T>(
  options: {
    key: string;
    /** Mantido por compatibilidade com callers; não usado no hit. */
    workspaceId?: string | string[];
    ttlMs?: number;
    fresh?: boolean;
  },
  compute: () => Promise<T>,
): Promise<T> {
  const { key, ttlMs = DEFAULT_TTL_MS, fresh = false } = options;
  const now = Date.now();

  if (!fresh) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) {
      remember(key, hit);
      return hit.value as T;
    }
  }

  const value = await compute();
  remember(key, { expiresAt: now + ttlMs, value });
  return value;
}
