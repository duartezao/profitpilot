"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { AppNavLinks } from "@/components/app-nav-links";
import { AppLogo } from "@/components/app-logo";
import { useAppViewModeContext } from "@/components/app-view-mode-provider";
import { homePathForMode } from "@/lib/app-view-mode";
import { hrefWithScope } from "@/lib/scope-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "pp-sidebar-collapsed";

function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  const { mode } = useAppViewModeContext();
  const searchParams = useSearchParams();
  const home = hrefWithScope(homePathForMode(mode), searchParams);

  return (
    <Link
      href={home}
      className={cn(
        "flex min-w-0 items-center",
        collapsed && "justify-center",
      )}
      title="ProfitPilot"
    >
      {collapsed ? (
        <span className="text-base font-semibold tracking-tight text-accent">
          P
        </span>
      ) : (
        <AppLogo />
      )}
    </Link>
  );
}

export function AppSidebar() {
  const searchParams = useSearchParams();
  /** Com loja: nav longa — nunca ícones-só (fica ilegível). */
  const hasStore = Boolean(searchParams.get("store"));

  const [prefCollapsed, setPrefCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setPrefCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const collapsed = hasStore ? false : prefCollapsed;

  function toggle() {
    // Com loja seleccionada o menu fica sempre aberto.
    if (hasStore) return;
    setPrefCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "glass-nav hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-200 ease-out lg:flex lg:overflow-hidden",
        collapsed ? "w-[4.5rem]" : "w-60 xl:w-64",
        !ready && "opacity-0",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2 pt-1",
          collapsed ? "justify-center px-2" : "justify-between px-4 xl:px-5",
        )}
      >
        <Suspense fallback={collapsed ? null : <AppLogo />}>
          <SidebarLogo collapsed={collapsed} />
        </Suspense>
        {!collapsed && !hasStore && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="h-8 w-8 shrink-0 text-muted-foreground"
            aria-label="Fechar menu lateral"
            title="Fechar menu"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto pb-4 pt-1",
          collapsed ? "px-2" : "px-3",
        )}
      >
        <Suspense
          fallback={
            <div className={cn("space-y-2", collapsed ? "px-0" : "px-2")}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-muted/60"
                />
              ))}
            </div>
          }
        >
          <AppNavLinks collapsed={collapsed} />
        </Suspense>
      </div>

      {collapsed && (
        <div className="shrink-0 border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="h-10 w-full text-muted-foreground"
            aria-label="Abrir menu lateral"
            title="Abrir menu"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </aside>
  );
}
