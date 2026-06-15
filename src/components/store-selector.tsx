"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Store as StoreIcon, ChevronDown, Check } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { Sensitive } from "@/components/privacy-mode";
import { persistActiveStore } from "@/lib/scope-query";
import { parsePortfolioParam } from "@/lib/portfolio-scope";
import { cn } from "@/lib/utils";

export type StoreOption = { id: string; name: string };

const menuPanelCls =
  "z-[210] max-h-[min(32rem,calc(100vh-6rem))] overflow-y-auto rounded-lg border border-border bg-surface p-1 max-md:fixed max-md:inset-x-3 max-md:top-[5.75rem] md:absolute md:top-full md:mt-1 md:max-h-80";

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

  const validStore =
    current && stores.some((s) => s.id === current) ? current : null;

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

  return (
    <div className={cn("relative z-50 min-w-0", className)}>
      <button
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

      {open && (
        <>
          <div
            className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-[1px] md:bg-black/20 md:dark:bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className={cn(menuPanelCls, "md:left-auto md:right-0 md:w-56")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button className={itemCls} onClick={() => select(null)}>
              <span>Todas as lojas</span>
              {!validStore && <Check className="h-4 w-4 text-accent" />}
            </button>
            {stores.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">
                Sem lojas ligadas.
              </p>
            )}
            {stores.map((s) => (
              <button key={s.id} className={itemCls} onClick={() => select(s.id)}>
                <Sensitive className="truncate">{s.name}</Sensitive>
                {validStore === s.id && <Check className="h-4 w-4 text-accent" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
