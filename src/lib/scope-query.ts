import { periodQueryFromSearchParams, type PeriodInput } from "@/lib/period";

const STORE_SESSION_PREFIX = "pp-active-store:";

/** Query string com período, loja e portfolio (para links e APIs). */
export function scopeQueryFromSearchParams(params: URLSearchParams): string {
  const q = new URLSearchParams(periodQueryFromSearchParams(params));
  const store = params.get("store");
  if (store) q.set("store", store);
  const portfolio = params.get("portfolio");
  if (portfolio) q.set("portfolio", portfolio);
  return q.toString();
}

export function hrefWithScope(path: string, params: URLSearchParams): string {
  const qs = scopeQueryFromSearchParams(params);
  if (!qs) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${qs}`;
}

/**
 * Como hrefWithScope, mas inclui a loja persistida (sessionStorage) quando o URL
 * não traz ?store= — útil para links «Gerir custos» a partir da vista consolidada.
 */
export function hrefWithScopeAndStore(
  path: string,
  params: URLSearchParams,
  workspaceId?: string | null,
): string {
  if (params.get("store")) return hrefWithScope(path, params);
  if (workspaceId) {
    const persisted = getPersistedStore(workspaceId);
    if (persisted) {
      const q = new URLSearchParams(scopeQueryFromSearchParams(params));
      q.set("store", persisted);
      const qs = q.toString();
      return qs ? `${path}?${qs}` : path;
    }
  }
  return hrefWithScope(path, params);
}

/** OAuth start — garante `store` no query string sem URLs inválidas. */
export function hrefOAuthStart(
  apiPath: "/api/oauth/google/start" | "/api/oauth/meta/start",
  storeId: string,
  params: URLSearchParams,
): string {
  const q = new URLSearchParams(scopeQueryFromSearchParams(params));
  q.set("store", storeId);
  return `${apiPath}?${q.toString()}`;
}

export type ScopeInput = PeriodInput & {
  store?: string | null;
};

/** Versão para server components (searchParams da página). */
export function scopeQueryFromInput(input: ScopeInput = {}): string {
  const params = new URLSearchParams();
  if (input.period) params.set("period", input.period);
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.dates) params.set("dates", input.dates);
  if (input.store) params.set("store", input.store);
  return scopeQueryFromSearchParams(params);
}

export function persistActiveStore(workspaceId: string, storeId: string | null) {
  if (typeof window === "undefined") return;
  const key = `${STORE_SESSION_PREFIX}${workspaceId}`;
  if (!storeId) {
    sessionStorage.removeItem(key);
    return;
  }
  sessionStorage.setItem(key, storeId);
}

export function getPersistedStore(workspaceId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(`${STORE_SESSION_PREFIX}${workspaceId}`);
  } catch {
    return null;
  }
}

export function clearPersistedStore(workspaceId: string) {
  persistActiveStore(workspaceId, null);
}
