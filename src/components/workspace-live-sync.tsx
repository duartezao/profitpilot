"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/components/workspace-context";

/**
 * SSE live sync — invalida queries e refresca RSC quando o workspace muda
 * (estado operação, sync, tarefas, etc.) sem recarregar o browser.
 */
export function WorkspaceLiveSync() {
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const lastRev = useRef<string | null>(null);

  useEffect(() => {
    lastRev.current = null;
    const es = new EventSource("/api/live/stream");

    es.onmessage = (event) => {
      try {
        const { rev } = JSON.parse(event.data) as { rev?: string };
        if (!rev) return;
        if (lastRev.current !== null && rev !== lastRev.current) {
          void queryClient.invalidateQueries({
            predicate: (q) => {
              const key = q.queryKey[0];
              return (
                key === "metrics-summary" ||
                key === "portfolio-summary" ||
                key === "treasury" ||
                key === "metrics-treasury" ||
                key === "ad-spend-view" ||
                key === "decision-summary"
              );
            },
          });
        }
        lastRev.current = rev;
      } catch {
        /* ignorar payloads inválidos */
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [workspaceId, queryClient]);

  return null;
}
