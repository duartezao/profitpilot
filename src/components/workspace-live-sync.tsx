"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/components/workspace-context";
import { isLiveQueryKey } from "@/lib/live-query-keys";

const MIN_VISIBILITY_REFRESH_MS = 2_000;
const SSE_RECONNECT_MS = 4_000;

/**
 * SSE + refresh ao voltar à app (PWA, telemóvel, mudança de janela no desktop).
 */
export function WorkspaceLiveSync() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const lastRev = useRef<string | null>(null);
  const lastVisibilityRefresh = useRef(0);

  useEffect(() => {
    lastRev.current = null;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const refreshFromVisibility = () => {
      const now = Date.now();
      if (now - lastVisibilityRefresh.current < MIN_VISIBILITY_REFRESH_MS) return;
      lastVisibilityRefresh.current = now;

      void queryClient.invalidateQueries({
        predicate: (q) => isLiveQueryKey(q.queryKey),
      });
      router.refresh();
    };

    const connectSse = () => {
      if (cancelled) return;
      es?.close();
      es = new EventSource("/api/live/stream");

      es.onmessage = (event) => {
        try {
          const { rev } = JSON.parse(event.data) as { rev?: string };
          if (!rev) return;
          if (lastRev.current !== null && rev !== lastRev.current) {
            void queryClient.invalidateQueries({
              predicate: (q) => isLiveQueryKey(q.queryKey),
            });
            router.refresh();
          }
          lastRev.current = rev;
        } catch {
          /* ignorar payloads inválidos */
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!cancelled) {
          reconnectTimer = setTimeout(connectSse, SSE_RECONNECT_MS);
        }
      };
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      refreshFromVisibility();
      if (!es || es.readyState === EventSource.CLOSED) {
        connectSse();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        onVisible();
      }
    };

    connectSse();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      es?.close();
    };
  }, [workspaceId, queryClient, router]);

  return null;
}
