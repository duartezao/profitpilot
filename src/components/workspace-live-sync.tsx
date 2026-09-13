"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/components/workspace-context";
import { refreshLiveQueries } from "@/lib/refresh-live-queries";

const MIN_VISIBILITY_REFRESH_MS = 2_000;
const SSE_RECONNECT_MS = 4_000;

/**
 * SSE + revalidação live (`?fresh=1`) ao entrar na app, ao voltar ao ecrã,
 * e em F5 / Ctrl+R (Shift+F5 continua a ser reload completo).
 */
export function WorkspaceLiveSync() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const lastRev = useRef<string | null>(null);
  const lastVisibilityRefresh = useRef(0);
  const refreshBusy = useRef(false);

  useEffect(() => {
    lastRev.current = null;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const runFreshRefresh = async (opts?: { rsc?: boolean }) => {
      if (refreshBusy.current || cancelled) return;
      refreshBusy.current = true;
      try {
        await refreshLiveQueries(queryClient, { fresh: true });
        if (opts?.rsc !== false) router.refresh();
      } finally {
        refreshBusy.current = false;
      }
    };

    const refreshFromVisibility = () => {
      const now = Date.now();
      if (now - lastVisibilityRefresh.current < MIN_VISIBILITY_REFRESH_MS) return;
      lastVisibilityRefresh.current = now;
      void runFreshRefresh();
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
            // SSE: invalidação leve (sem fresh) — evita martelar a BD.
            void refreshLiveQueries(queryClient);
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

    const onKeyDown = (event: KeyboardEvent) => {
      const isF5 = event.key === "F5";
      const isCtrlR =
        (event.ctrlKey || event.metaKey) &&
        (event.key === "r" || event.key === "R");
      if (!isF5 && !isCtrlR) return;
      // Shift+F5 / Ctrl+Shift+R = reload completo do browser
      if (event.shiftKey) return;
      event.preventDefault();
      void runFreshRefresh();
    };

    // Entrada na app (mount) — mesma revalidação live do botão Actualizar.
    lastVisibilityRefresh.current = Date.now();
    void runFreshRefresh();

    connectSse();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("keydown", onKeyDown);
      es?.close();
    };
  }, [workspaceId, queryClient, router]);

  return null;
}
