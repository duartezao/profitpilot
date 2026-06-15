"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Briefcase, ChevronDown, Check, Plus, Loader2 } from "lucide-react";
import {
  createWorkspaceAction,
  type WorkspaceActionState,
} from "@/app/(app)/workspaces/actions";
import { useActionState } from "react";
import type { UserWorkspace } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/privacy-mode";
import { clearPersistedStore } from "@/lib/scope-query";
import { periodQueryFromSearchParams } from "@/lib/period";

export function WorkspaceSelector({
  workspaces,
  currentId,
  className,
  menuPlacement = "bottom",
}: {
  workspaces: UserWorkspace[];
  currentId: string;
  className?: string;
  /** `top` abre o menu acima do botão (sidebar no fundo). */
  menuPlacement?: "top" | "bottom";
}) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const [createState, createAction, creating] = useActionState<
    WorkspaceActionState,
    FormData
  >(createWorkspaceAction, {});

  const current = workspaces.find((w) => w.id === currentId);
  const itemCls =
    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-60";

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function pickWorkspace(workspaceId: string) {
    if (workspaceId === currentId) {
      setOpen(false);
      return;
    }
    setSwitchError(null);
    setSwitchingId(workspaceId);
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ workspaceId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setSwitchError(data.error ?? "Não foi possível trocar.");
        setSwitchingId(null);
        return;
      }
      clearPersistedStore(currentId);
      clearPersistedStore(workspaceId);
      setOpen(false);
      const periodQs = periodQueryFromSearchParams(searchParams);
      window.location.assign(
        periodQs ? `/dashboard?${periodQs}` : "/dashboard",
      );
    } catch {
      setSwitchError("Erro de rede. Tenta novamente.");
      setSwitchingId(null);
    }
  }

  function selectWorkspace(workspaceId: string) {
    void pickWorkspace(workspaceId);
  }

  return (
    <div className={cn("relative z-50", className)}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setSwitchError(null);
        }}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-foreground hover:bg-muted sm:gap-2 sm:px-3 sm:py-2"
      >
        <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Sensitive className="min-w-0 flex-1 truncate text-left">
          {current?.name ?? "Workspace"}
        </Sensitive>
        {switchingId ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-[1px] md:bg-black/20 md:dark:bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className={cn(
              "z-[210] max-h-[min(32rem,calc(100vh-6rem))] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-md",
              "max-md:fixed max-md:inset-x-3 max-md:top-[3.25rem]",
              menuPlacement === "top"
                ? "md:absolute md:inset-x-auto md:bottom-full md:top-auto md:mb-1"
                : "md:absolute md:inset-x-auto md:top-full md:mt-1",
              "md:left-0 md:w-full md:min-w-[16rem]",
            )}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              Workspaces
            </p>
            {switchError && (
              <p className="px-2.5 py-1 text-xs text-negative">{switchError}</p>
            )}
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                disabled={switchingId !== null}
                className={itemCls}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectWorkspace(w.id)}
              >
                <Sensitive className="min-w-0 truncate">
                  {w.name}
                  {w.role !== "owner" && (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · partilhado
                    </span>
                  )}
                </Sensitive>
                {w.id === currentId && (
                  <Check className="h-4 w-4 shrink-0 text-accent" />
                )}
              </button>
            ))}

            <div className="my-1 border-t border-border" />

            {!showCreate ? (
              <button
                type="button"
                className={`${itemCls} text-accent`}
                onClick={() => setShowCreate(true)}
              >
                <span className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Novo workspace
                </span>
              </button>
            ) : (
              <form action={createAction} className="space-y-2 p-2">
                {createState.error && (
                  <p className="text-xs text-negative">{createState.error}</p>
                )}
                <input
                  name="name"
                  placeholder="Nome do workspace"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
                  required
                />
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-md bg-accent px-2 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {creating ? "A criar…" : "Criar"}
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
