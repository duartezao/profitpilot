"use client";

import { useCallback } from "react";
import { AppViewModeProvider } from "@/components/app-view-mode-provider";
import { useAppViewMode } from "@/hooks/use-app-view-mode";
import type { AppViewMode } from "@/lib/app-view-mode";

export function AppViewModeShell({
  workspaceId,
  initialMode,
  children,
}: {
  workspaceId: string;
  initialMode?: AppViewMode;
  children: React.ReactNode;
}) {
  const { mode, ready, save } = useAppViewMode(workspaceId, initialMode);

  const setMode = useCallback(
    async (next: AppViewMode) => {
      await save(next);
    },
    [save],
  );

  return (
    <AppViewModeProvider mode={mode} ready={ready} setMode={setMode}>
      {children}
    </AppViewModeProvider>
  );
}
