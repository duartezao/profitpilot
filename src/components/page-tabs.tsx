"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

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
            "inline-flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === t.id
              ? "border-accent bg-accent/15 font-semibold text-accent"
              : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
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
    <Card>
      <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">{children}</CardContent>
    </Card>
  );
}
