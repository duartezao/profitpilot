"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, MoreHorizontal } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { PrivacyToggle } from "@/components/privacy-mode";
import { AppViewModeToggle } from "@/components/app-view-mode-toggle";
import { logoutAction } from "@/app/(app)/actions";
import type { CurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Menu «…» — tema, privacy, modo de vista e logout (fora da barra principal). */
export function TopbarMoreMenu({
  user,
  className,
}: {
  user: CurrentUser;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        aria-label="Mais opções"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground",
          open && "bg-muted text-foreground",
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[220] mt-1 w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-none">
          <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {initials(user.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email || (user.username ? `@${user.username}` : null)}
              </p>
            </div>
          </div>

          <div className="space-y-2 border-b border-border px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
              Vista
            </p>
            <AppViewModeToggle className="flex w-full [&>button]:flex-1" />
          </div>

          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-sm text-muted-foreground">Tema</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-sm text-muted-foreground">Privacidade</span>
            <PrivacyToggle />
          </div>

          <form action={logoutAction} className="border-t border-border p-1">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Terminar sessão
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
