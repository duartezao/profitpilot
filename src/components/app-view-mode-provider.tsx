"use client";

import { createContext, useContext } from "react";
import type { AppViewMode } from "@/lib/app-view-mode";

type AppViewModeContextValue = {
  mode: AppViewMode;
  ready: boolean;
  setMode: (mode: AppViewMode) => Promise<void>;
};

const AppViewModeContext = createContext<AppViewModeContextValue>({
  mode: "financial",
  ready: false,
  setMode: async () => {},
});

export function AppViewModeProvider({
  mode,
  ready,
  setMode,
  children,
}: AppViewModeContextValue & { children: React.ReactNode }) {
  return (
    <AppViewModeContext.Provider value={{ mode, ready, setMode }}>
      {children}
    </AppViewModeContext.Provider>
  );
}

export function useAppViewModeContext() {
  return useContext(AppViewModeContext);
}
