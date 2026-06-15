"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsCollapsibleSection({
  id,
  title,
  description,
  badge,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!id || typeof window === "undefined") return;
    if (window.location.hash === `#${id}`) {
      setOpen(true);
    }
  }, [id]);

  return (
    <section
      id={id}
      className="scroll-mt-20 rounded-lg border border-border bg-surface"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-muted/40 sm:p-5"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            {badge}
          </div>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted-foreground">
          {open ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fechar</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Abrir</span>
            </>
          )}
        </span>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 border-t border-border px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
