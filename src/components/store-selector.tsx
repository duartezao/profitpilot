"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Store as StoreIcon,
  ChevronDown,
  Check,
  PauseCircle,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { Sensitive } from "@/components/privacy-mode";
import { useAppViewModeContext } from "@/components/app-view-mode-provider";
import { pathAllowedForStoreScope } from "@/lib/nav";
import { persistActiveStore } from "@/lib/scope-query";
import { parsePortfolioParam } from "@/lib/portfolio-scope";
import { cn } from "@/lib/utils";

import { storeActiveInFinancialPeriod } from "@/lib/operation-filters";
import { periodFromSearchParams } from "@/lib/period";
import type { StoreOperationStatus } from "@/lib/operations-pipeline";
import { TAP_PRESS, TAP_PRESS_ROW } from "@/lib/ui-press";

export type StoreOption = {
  id: string;
  name: string;
  /** Estado da loja (definicoes). Pausadas ficam recolhidas no seletor. */
  status?: "active" | "paused" | "archived" | null;
  operationStatus?: StoreOperationStatus | null;
  operationKilledAt?: string | null;
};

const menuPanelCls =
  "overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-none";

function menuPositionFromTrigger(rect: DOMRect): CSSProperties {
  const gap = 4;
  const minWidth = 224;
  const width = Math.max(rect.width, minWidth);
  let left = rect.left;
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - width - 8);
  }
  const maxHeight = Math.min(
    512,
    Math.max(120, window.innerHeight - rect.bottom - gap - 12),
  );
  return {
    position: "fixed",
    top: rect.bottom + gap,
    left,
    width,
    maxHeight,
    zIndex: 9999,
  };
}

export function StoreSelector({
  stores,
  className,
}: {
  stores: StoreOption[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { workspaceId } = useWorkspace();
  const { mode: appViewMode } = useAppViewModeContext();
  const current = params.get("store");
  const period = periodFromSearchParams(params);

  const visibleStores = stores.filter((s) => {
    if (appViewMode === "operations") return true;
    return storeActiveInFinancialPeriod(
      {
        operationStatus: s.operationStatus ?? undefined,
        operationKilledAt: s.operationKilledAt ?? undefined,
      },
      {
        start: period.start,
        end: period.end,
        specificDates: period.specificDates,
      },
    );
  });

  const { activeStores, pausedStores } = useMemo(() => {
    const active: StoreOption[] = [];
    const paused: StoreOption[] = [];
    for (const s of visibleStores) {
      if (s.status === "paused") paused.push(s);
      else active.push(s);
    }
    return { activeStores: active, pausedStores: paused };
  }, [visibleStores]);

  const portfolioActive = parsePortfolioParam(params.get("portfolio")) !== null;
  const [open, setOpen] = useState(false);
  const [showPaused, setShowPaused] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  const validStore =
    current && visibleStores.some((s) => s.id === current) ? current : null;
  const selectedIsPaused = Boolean(
    validStore && pausedStores.some((s) => s.id === validStore),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) setShowPaused(false);
  }, [open]);

  useEffect(() => {
    if (open && selectedIsPaused) setShowPaused(true);
  }, [open, selectedIsPaused]);

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
  }, [open, showPaused]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Limpa ?store= inválido (ex. após trocar de workspace).
  useEffect(() => {
    if (validStore && workspaceId) {
      persistActiveStore(workspaceId, validStore);
    }
    if (current && !validStore) {
      persistActiveStore(workspaceId, null);
      const next = new URLSearchParams(params.toString());
      next.delete("store");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }, [current, validStore, workspaceId, params, pathname, router]);

  const currentName = portfolioActive
    ? "Multi-workspace"
    : validStore
      ? (visibleStores.find((s) => s.id === validStore)?.name ?? "Loja")
      : "Todas as lojas";

  if (portfolioActive) {
    return (
      <div
        className={cn("relative", className)}
        title="Métricas de vários workspaces — filtro por loja indisponível"
      >
        <div className="flex w-full min-w-0 cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-sm text-muted-foreground sm:gap-2 sm:px-3 sm:py-2">
          <StoreIcon className="h-4 w-4 shrink-0 opacity-60" />
          <span className="min-w-0 flex-1 truncate text-left">{currentName}</span>
        </div>
      </div>
    );
  }

  function select(id: string | null) {
    const next = new URLSearchParams(params.toString());
    if (id) {
      next.set("store", id);
      persistActiveStore(workspaceId, id);
    } else {
      next.delete("store");
      persistActiveStore(workspaceId, null);
    }
    let target = pathname;
    if (
      appViewMode === "financial" &&
      !pathAllowedForStoreScope(pathname, id, appViewMode)
    ) {
      target = "/dashboard";
    }
    const qs = next.toString();
    router.push(qs ? `${target}?${qs}` : target);
    setOpen(false);
  }

  const itemCls = cn(
    TAP_PRESS_ROW,
    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted",
  );

  const menuBody = (
    <>
      <button
        type="button"
        className={itemCls}
        onClick={() => select(null)}
      >
        <span>Todas as lojas</span>
        {!validStore && <Check className="h-4 w-4 text-accent" />}
      </button>
      {activeStores.length === 0 && pausedStores.length === 0 && (
        <p className="px-2.5 py-2 text-xs text-muted-foreground">
          Nenhuma loja com dados neste período.
        </p>
      )}
      {activeStores.map((s) => (
        <button
          key={s.id}
          type="button"
          className={itemCls}
          onClick={() => select(s.id)}
        >
          <Sensitive className="truncate">{s.name}</Sensitive>
          {validStore === s.id && <Check className="h-4 w-4 text-accent" />}
        </button>
      ))}

      {pausedStores.length > 0 && (
        <div className="mt-0.5 border-t border-border pt-0.5">
          <button
            type="button"
            className={cn(
              TAP_PRESS_ROW,
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-expanded={showPaused}
            onClick={() => setShowPaused((v) => !v)}
          >
            <PauseCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              Lojas pausadas
              <span className="ml-1 tabular-nums opacity-70">
                ({pausedStores.length})
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform",
                showPaused && "rotate-180",
              )}
            />
          </button>
          {showPaused &&
            pausedStores.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn(itemCls, "pl-8 text-muted-foreground")}
                onClick={() => select(s.id)}
              >
                <Sensitive className="truncate">{s.name}</Sensitive>
                {validStore === s.id && (
                  <Check className="h-4 w-4 text-accent" />
                )}
              </button>
            ))}
        </div>
      )}
    </>
  );

  return (
    <div className={cn("relative min-w-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Loja: ${currentName}`}
        className={cn(
          TAP_PRESS,
          "flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-foreground hover:bg-muted sm:gap-2 sm:px-3",
        )}
      >
        <StoreIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Sensitive className="min-w-0 flex-1 truncate text-left">
          {currentName}
        </Sensitive>
        {selectedIsPaused && (
          <PauseCircle
            className="h-3.5 w-3.5 shrink-0 text-warning"
            aria-label="Pausada"
          />
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open &&
        mounted &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998] bg-background/80 backdrop-blur-[1px] dark:bg-black/40"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              className={menuPanelCls}
              style={menuStyle}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {menuBody}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
