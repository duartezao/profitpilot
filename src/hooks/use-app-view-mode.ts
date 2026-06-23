"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_APP_VIEW_MODE,
  normalizeAppViewMode,
  storageKeyForAppViewMode,
  type AppViewMode,
} from "@/lib/app-view-mode";
import {
  loadAppViewModeAction,
  saveAppViewModeAction,
} from "@/app/(app)/operacao/actions";

export function useAppViewMode(
  workspaceId: string,
  initialMode?: AppViewMode,
) {
  const [mode, setMode] = useState<AppViewMode>(
    initialMode ?? DEFAULT_APP_VIEW_MODE,
  );
  const [ready, setReady] = useState(true);
  const userChangingRef = useRef(false);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    (async () => {
      try {
        const fromServer = await loadAppViewModeAction();
        if (!cancelled && !userChangingRef.current) {
          const normalized = normalizeAppViewMode(fromServer);
          setMode(normalized);
          localStorage.setItem(
            storageKeyForAppViewMode(workspaceId),
            normalized,
          );
        }
      } catch {
        try {
          const raw = localStorage.getItem(storageKeyForAppViewMode(workspaceId));
          if (!cancelled && !userChangingRef.current && raw) {
            setMode(normalizeAppViewMode(raw));
          }
        } catch {
          if (!cancelled && !userChangingRef.current) {
            setMode(DEFAULT_APP_VIEW_MODE);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const save = useCallback(
    async (next: AppViewMode) => {
      const normalized = normalizeAppViewMode(next);
      userChangingRef.current = true;
      setMode(normalized);
      if (workspaceId) {
        localStorage.setItem(storageKeyForAppViewMode(workspaceId), normalized);
      }
      try {
        const result = await saveAppViewModeAction(normalized);
        if (result.mode) {
          setMode(normalizeAppViewMode(result.mode));
        }
        return result;
      } finally {
        userChangingRef.current = false;
      }
    },
    [workspaceId],
  );

  return { mode, ready, save };
}
