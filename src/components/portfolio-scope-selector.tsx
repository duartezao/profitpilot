"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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

function menuPositionFromTrigger(rect: DOMRect): CSSProperties {
  const gap = 4;
  const width = Math.max(rect.width, 288);
  let left = rect.left;
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - width - 8);
  }
  const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
  const spaceAbove = rect.top - 12;
  const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    420,
    Math.max(160, openUp ? spaceAbove - gap : spaceBelow),
  );
  return {
    position: "fixed",
    left,
    width,
    maxHeight,
    zIndex: 9999,
    ...(openUp
      ? { bottom: window.innerHeight - rect.top + gap }
      : { top: rect.bottom + gap }),
  };
}

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
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  const portfolioRaw = params.get("portfolio");
  const portfolioParsed = parsePortfolioParam(portfolioRaw);
  const isPortfolio = portfolioParsed !== null;
  const isAll = portfolioParsed === "all";

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const el = triggerRef.current;
      if (!el) return;
      setMenuStyle(menuPositionFromTrigger(el.getBoundingClientRect()));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

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
        ref={triggerRef}
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
            className="fixed inset-0 z-[9998] bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
            style={menuStyle}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              <p className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                Comparar workspaces
              </p>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
                onClick={selectActiveOnly}
              >
                Só este workspace
                {!isPortfolio && (
                  <Check className="h-4 w-4 shrink-0 text-accent" />
                )}
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
            </div>
            <div className="shrink-0 border-t border-border bg-popover p-2">
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
