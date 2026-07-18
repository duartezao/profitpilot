import type { QueryClient } from "@tanstack/react-query";
import { isLiveQueryKey } from "@/lib/live-query-keys";

/** Durante um refresh manual (PTR), os fetchers acrescentam `?fresh=1`. */
export const liveFetchFreshRef = { current: false };

/** Acrescenta `fresh=1` a um URL relativo quando o refresh manual está activo. */
export function withLiveFreshParam(url: string): string {
  if (!liveFetchFreshRef.current || typeof window === "undefined") return url;
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
  }
}
