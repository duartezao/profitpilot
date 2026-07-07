"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Briefcase, ChevronDown, Check } from "lucide-react";
import type { UserWorkspace } from "@/lib/auth";
import { Sensitive } from "@/components/privacy-mode";
import {
  parsePortfolioParam,
  portfolioParamFromIds,
  persistPortfolioScope,
} from "@/lib/portfolio-scope";
import { periodQueryFromSearchParams } from "@/lib/period";
import { cn } from "@/lib/utils";

const menuPanelCls =
  "z-[210] max-h-[min(32rem,calc(100vh-6rem))] overflow-y-auto rounded-lg border border-border bg-surface p-1 max-md:fixed max-md:inset-x-3 max-md:top-[5.75rem] md:absolute md:top-full md:mt-1 md:max-h-96";

export function PortfolioScopeSelector({
  workspaces,
  userId,
  className,
}: {
  workspaces: UserWorkspace[];
  userId: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const portfolioRaw = params.get("portfolio");
  const portfolioParsed = parsePortfolioParam(portfolioRaw);
  const isPortfolio = portfolioParsed !== null;
  const isAll = portfolioParsed === "all";

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (portfolioParsed === "all") {
      setPicked(new Set(workspaces.map((w) => w.id)));
    } else if (Array.isArray(portfolioParsed)) {
      setPicked(new Set(portfolioParsed));
    } else {
      setPicked(new Set());
    }
  }, [portfolioParsed, workspaces]);

  const label = !isPortfolio
    ? "Só este workspace"
    : isAll
      ? "Todos os workspaces"
      : `${picked.size} workspaces`;

  function navigate(portfolio: string | null) {
    const next = new URLSearchParams(params.toString());
    next.delete("store");
    if (portfolio) {
      next.set("portfolio", portfolio);
      persistPortfolioScope(userId, portfolio);
    } else {
      next.delete("portfolio");
      persistPortfolioScope(userId, null);
    }
    const qs = next.toString();
    const target =
      pathname === "/dashboard" || pathname.startsWith("/dashboard")
        ? pathname
        : "/dashboard";
    const periodQs = periodQueryFromSearchParams(params);
    const merged = new URLSearchParams(qs);
    if (periodQs) {
      const periodParams = new URLSearchParams(periodQs);
      for (const [k, v] of periodParams) {
        if (!merged.has(k)) merged.set(k, v);
      }
    }
    const finalQs = merged.toString();
    router.push(finalQs ? `${target}?${finalQs}` : target);
    setOpen(false);
  }

  function selectActiveOnly() {
    navigate(null);
  }

  function selectAll() {
    navigate("all");
  }

  function toggleWorkspace(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applySelection() {
    const ids = [...picked];
    if (ids.length < 2) {
      navigate(null);
      return;
    }
    if (ids.length === workspaces.length) {
      navigate("all");
      return;
    }
    navigate(portfolioParamFromIds(ids));
  }

  if (workspaces.length < 2) return null;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm hover:bg-muted sm:gap-2 sm:px-3 sm:py-2",
          isPortfolio
            ? "border-accent/40 bg-accent/5 text-foreground"
            : "border-border text-foreground",
        )}
      >
        <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[200] bg-black/20 dark:bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className={cn(menuPanelCls, "left-0 w-full min-w-[16rem] md:w-72")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              Comparar workspaces
            </p>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
              onClick={selectActiveOnly}
            >
              Só este workspace
              {!isPortfolio && <Check className="h-4 w-4 shrink-0 text-accent" />}
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
              onClick={selectAll}
            >
              Todos os workspaces
              {isAll && <Check className="h-4 w-4 shrink-0 text-accent" />}
            </button>

            <div className="my-1 border-t border-border" />
            <p className="px-2.5 py-1 text-xs text-muted-foreground">
              Ou escolhe 2+ workspaces
            </p>
            {workspaces.map((w) => (
              <label
                key={w.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={picked.has(w.id)}
                  onChange={() => toggleWorkspace(w.id)}
                  className="h-4 w-4 rounded border-border"
                />
                <Sensitive className="min-w-0 flex-1 truncate">
                  {w.name}
                </Sensitive>
              </label>
            ))}
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={applySelection}
                disabled={picked.size < 2}
                className="w-full rounded-md bg-accent px-2 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                Aplicar ({picked.size})
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
