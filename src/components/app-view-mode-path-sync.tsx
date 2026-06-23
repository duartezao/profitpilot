"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { modeInferredFromPath } from "@/lib/app-view-mode";
import { useAppViewModeContext } from "@/components/app-view-mode-provider";

/**
 * Alinha o modo com a rota quando o utilizador navega (sidebar, URL, etc.).
 * Só reage a mudanças de pathname — não interfere com o toggle em curso.
 */
export function AppViewModePathSync() {
  const pathname = usePathname();
  const { ready, setMode } = useAppViewModeContext();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (!ready) return;
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;

    const inferred = modeInferredFromPath(pathname);
    if (inferred) void setMode(inferred);
  }, [pathname, ready, setMode]);

  return null;
}
