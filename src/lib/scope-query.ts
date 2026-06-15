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
  return qs ? `${path}?${qs}` : path;
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
