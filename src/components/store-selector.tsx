"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Store as StoreIcon, ChevronDown, Check } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { Sensitive } from "@/components/privacy-mode";
import { persistActiveStore } from "@/lib/scope-query";
import { cn } from "@/lib/utils";

export type StoreOption = { id: string; name: string };

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
  const [open, setOpen] = useState(false);

  const validStore =
    current && stores.some((s) => s.id === current) ? current : null;

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

  const currentName = validStore
    ? (stores.find((s) => s.id === validStore)?.name ?? "Loja")
    : "Todas as lojas";

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
    <div className={cn("relative min-w-0", className)}>
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
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "absolute z-40 mt-1 max-h-80 overflow-auto rounded-lg border border-border bg-surface p-1 shadow-sm",
              "left-0 w-[min(16rem,calc(100vw-1.5rem))]",
              "sm:left-auto sm:right-0 sm:w-56",
            )}
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
