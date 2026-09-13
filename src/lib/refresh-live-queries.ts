import type { QueryClient } from "@tanstack/react-query";
import { isLiveQueryKey } from "@/lib/live-query-keys";

/** Durante um refresh manual (PTR / F5 / entrada na app), os fetchers acrescentam `?fresh=1`. */
export const liveFetchFreshRef = { current: false };

/**
 * Após F5 hard / abertura da app: a 1.ª vaga de fetches (antes dos effects)
 * também vai com `?fresh=1`. Limpa-se no fim do 1.º refreshLiveQueries ou por timeout.
 */
export const liveBootFreshRef = {
  current: typeof window !== "undefined",
};

if (typeof window !== "undefined") {
  window.setTimeout(() => {
    liveBootFreshRef.current = false;
  }, 5_000);
}

/** Acrescenta `fresh=1` a um URL relativo quando o refresh manual / boot está activo. */
export function withLiveFreshParam(url: string): string {
  if (typeof window === "undefined") return url;
  if (!liveFetchFreshRef.current && !liveBootFreshRef.current) return url;
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("fresh", "1");
    return `${u.pathname}${u.search}`;
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}fresh=1`;
  }
}

/**
 * Invalida queries live (métricas, ads, tesouraria, …).
 * Com `fresh: true`, os pedidos activos vão com `?fresh=1` (bypass cache servidor).
 */
export async function refreshLiveQueries(
  queryClient: QueryClient,
  options?: { fresh?: boolean },
): Promise<void> {
  const fresh = Boolean(options?.fresh);
  liveFetchFreshRef.current = fresh;
  try {
    await queryClient.invalidateQueries({
      predicate: (q) => isLiveQueryKey(q.queryKey),
    });
  } finally {
    liveFetchFreshRef.current = false;
    liveBootFreshRef.current = false;
  }
}
