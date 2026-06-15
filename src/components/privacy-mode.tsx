"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "pp-privacy-mode";

type PrivacyModeContextValue = {
  enabled: boolean;
  toggle: () => void;
};

const PrivacyModeContext = createContext<PrivacyModeContextValue | null>(null);

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.dataset.privacy = enabled ? "true" : "false";
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [enabled, mounted]);

  const toggle = useCallback(() => setEnabled((v) => !v), []);

  return (
    <PrivacyModeContext.Provider value={{ enabled, toggle }}>
      {children}
    </PrivacyModeContext.Provider>
  );
}

export function usePrivacyMode() {
  const ctx = useContext(PrivacyModeContext);
  if (!ctx) {
    throw new Error("usePrivacyMode must be used within PrivacyModeProvider");
  }
  return ctx;
}

/** Envolve texto/valores que devem ficar desfocados no modo apresentação. */
export function Sensitive({
  children,
  className,
  as: Tag = "span",
  ...props
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag data-sensitive className={className} {...props}>
      {children}
    </Tag>
  );
}

export function PrivacyToggle() {
  const { enabled, toggle } = usePrivacyMode();

  return (
    <button
      type="button"
      aria-label={
        enabled
          ? "Mostrar valores e nomes sensíveis"
          : "Ocultar valores e nomes sensíveis"
      }
      title={
        enabled
          ? "Modo apresentação ativo — clicar para mostrar dados"
          : "Modo apresentação — ocultar valores, lojas e produtos"
      }
      aria-pressed={enabled}
      onClick={toggle}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted",
        enabled && "border-accent/40 bg-accent/10 text-accent",
      )}
    >
      {enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}
