"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PageTab = {
  id: string;
  label: string;
  badge?: ReactNode;
};

export function PageTabs({
  tabs,
  active,
  onChange,
  ariaLabel = "Secções",
}: {
  tabs: PageTab[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex gap-1 overflow-x-auto border-b border-border pb-px"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === t.id
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
    </nav>
  );
}

export function PageTabCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      {children}
    </div>
  );
}
