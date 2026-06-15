"use client";

import { useActionState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { syncStoreAction, type SyncState } from "@/app/(app)/lojas/actions";
import { cn } from "@/lib/utils";

export function StoreSyncButton({
  storeId,
  className,
  onDone,
}: {
  storeId: string;
  className?: string;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [state, action, pending] = useActionState<SyncState, FormData>(
    syncStoreAction,
    {},
  );

  useEffect(() => {
    if (!state.ok && !state.error) return;
    void queryClient.invalidateQueries({ queryKey: ["metrics-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["treasury"] });
    onDone?.();
  }, [state.ok, state.error, queryClient, onDone]);

  return (
    <form action={action} className={cn("flex flex-wrap items-center gap-2", className)}>
      <input type="hidden" name="storeId" value={storeId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
        {pending ? "A sincronizar…" : "Sincronizar agora"}
      </button>
      {state.ok && state.message && (
        <span className="text-xs text-positive">{state.message}</span>
      )}
      {state.error && (
        <span className="text-xs text-negative">{state.error}</span>
      )}
    </form>
  );
}
