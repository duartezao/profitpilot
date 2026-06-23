"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  APP_VIEW_MODE_LABEL,
  APP_VIEW_MODE_LABEL_SHORT,
  targetPathAfterModeSwitch,
  type AppViewMode,
} from "@/lib/app-view-mode";
import { hrefWithScope } from "@/lib/scope-query";
import { useAppViewModeContext } from "@/components/app-view-mode-provider";

export function AppViewModeToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { mode, ready, setMode } = useAppViewModeContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function switchTo(next: AppViewMode) {
    if (next === mode || pending) return;

    const target = targetPathAfterModeSwitch(pathname, next);

    startTransition(() => {
      void setMode(next);
      if (target) {
        router.push(hrefWithScope(target, searchParams));
      }
    });
  }

  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-border p-0.5",
        pending && "opacity-80",
        className,
      )}
      role="group"
      aria-label="Modo da aplicação"
      aria-busy={pending}
    >
      {(["financial", "operations"] as const).map((key) => (
        <button
          key={key}
          type="button"
          disabled={!ready || pending}
          onClick={() => switchTo(key)}
          className={cn(
            "rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors lg:px-2.5",
            mode === key
              ? "bg-accent/10 text-accent"
              : "text-muted-foreground hover:bg-muted",
            (!ready || pending) && "pointer-events-none opacity-60",
          )}
          title={APP_VIEW_MODE_LABEL[key]}
          aria-pressed={mode === key}
        >
          {compact ? (
            <>
              <span className="xl:hidden">{APP_VIEW_MODE_LABEL_SHORT[key]}</span>
              <span className="hidden xl:inline">{APP_VIEW_MODE_LABEL[key]}</span>
            </>
          ) : (
            APP_VIEW_MODE_LABEL[key]
          )}
        </button>
      ))}
    </div>
  );
}
