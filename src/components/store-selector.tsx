"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Store as StoreIcon, ChevronDown, Check } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { Sensitive } from "@/components/privacy-mode";
import { persistActiveStore } from "@/lib/scope-query";
import { parsePortfolioParam } from "@/lib/portfolio-scope";
import { cn } from "@/lib/utils";

export type StoreOption = { id: string; name: string };

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
  const current = params.get("store");
  const portfolioActive = parsePortfolioParam(params.get("portfolio")) !== null;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  const validStore =
    current && stores.some((s) => s.id === current) ? current : null;

  useEffect(() => {
    setMounted(true);
  }, []);

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
      ? (stores.find((s) => s.id === validStore)?.name ?? "Loja")
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
    if (id) {
      target = "/dashboard";
    } else if (!id && pathname !== "/dashboard") {
      target = "/dashboard";
    }
    const qs = next.toString();
    router.push(qs ? `${target}?${qs}` : target);
    setOpen(false);
  }

  const itemCls =
    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted";

  const menuBody = (
    <>
      <button type="button" className={itemCls} onClick={() => select(null)}>
        <span>Todas as lojas</span>
        {!validStore && <Check className="h-4 w-4 text-accent" />}
      </button>
      {stores.length === 0 && (
        <p className="px-2.5 py-2 text-xs text-muted-foreground">
          Sem lojas ligadas.
        </p>
      )}
      {stores.map((s) => (
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
    </>
  );

  return (
    <div className={cn("relative min-w-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-foreground hover:bg-muted sm:gap-2 sm:px-3"
      >
        <StoreIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Sensitive className="min-w-0 flex-1 truncate text-left">
          {currentName}
        </Sensitive>
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
