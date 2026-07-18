import type { QueryClient, Query } from "@tanstack/react-query";
import { isLiveQueryKey } from "@/lib/live-query-keys";

const STORAGE_KEY = "pp-rq-live-v1";
const MAX_BYTES = 1_400_000;
const PERSIST_DEBOUNCE_MS = 400;

type PersistedEntry = {
  queryKey: unknown[];
  data: unknown;
  dataUpdatedAt: number;
};

type PersistedBlob = {
  v: 1;
  entries: PersistedEntry[];
};

export function clearLiveQueryPersist(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* */
  }
}

function readBlob(): PersistedBlob | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedBlob;
    if (parsed?.v !== 1 || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeBlob(entries: PersistedEntry[]): void {
  try {
    let slice = entries;
    for (;;) {
      const raw = JSON.stringify({ v: 1, entries: slice } satisfies PersistedBlob);
      if (raw.length <= MAX_BYTES || slice.length <= 1) {
        sessionStorage.setItem(STORAGE_KEY, raw);
        return;
      }
      slice = slice.slice(0, Math.floor(slice.length / 2));
    }
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* quota / private mode */
    }
  }
}

function collectLiveEntries(client: QueryClient): PersistedEntry[] {
  return client
    .getQueryCache()
    .getAll()
    .filter(
      (q): q is Query =>
        isLiveQueryKey(q.queryKey) && q.state.data !== undefined,
    )
    .map((q) => ({
      queryKey: [...q.queryKey] as unknown[],
      data: q.state.data,
      dataUpdatedAt: q.state.dataUpdatedAt,
    }))
    .sort((a, b) => b.dataUpdatedAt - a.dataUpdatedAt);
}

/** Restaura queries live a partir do sessionStorage (paint imediato no PWA). */
export function hydrateLiveQueryCache(client: QueryClient): void {
  if (typeof window === "undefined") return;
  const blob = readBlob();
  if (!blob) return;
  for (const entry of blob.entries) {
    if (!isLiveQueryKey(entry.queryKey)) continue;
    const existing = client.getQueryData(entry.queryKey);
    if (existing !== undefined) continue;
    client.setQueryData(entry.queryKey, entry.data, {
      updatedAt: entry.dataUpdatedAt,
    });
  }
}

/** Persiste queries live no sessionStorage (debounced). */
export function subscribeLiveQueryPersistence(client: QueryClient): () => void {
  if (typeof window === "undefined") return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;

  const persist = () => {
    writeBlob(collectLiveEntries(client));
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(persist, PERSIST_DEBOUNCE_MS);
  };

  const unsub = client.getQueryCache().subscribe(() => {
    schedule();
  });

  const onHide = () => {
    if (timer) clearTimeout(timer);
    persist();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);

  return () => {
    unsub();
    if (timer) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
  };
}
