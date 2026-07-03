"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChunkedSyncStatus } from "@/lib/store-sync-chunked";
import { cn } from "@/lib/utils";

const IDLE: ChunkedSyncStatus = {
  status: "idle",
  phase: null,
  progress: 0,
  message: "",
  ordersImported: 0,
  ordersUpdated: 0,
  orderPagesDone: 0,
  productsImported: 0,
  payoutsImported: 0,
  balanceTransactionsImported: 0,
  sessionDaysSynced: 0,
  error: null,
  resultSummary: null,
  continue: false,
};

async function parseSyncResponse(
  res: Response,
): Promise<ChunkedSyncStatus & { error?: string }> {
  const text = await res.text();
  if (
    text.includes("FUNCTION_INVOCATION_TIMEOUT") ||
    res.status === 504
  ) {
    throw new Error(
      "O servidor demorou demasiado (limite Vercel). A continuar no próximo passo…",
    );
  }
  let data: ChunkedSyncStatus & { error?: string };
  try {
    data = JSON.parse(text) as ChunkedSyncStatus & { error?: string };
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 100);
    throw new Error(
      preview && !preview.startsWith("{")
        ? preview
        : `Resposta inválida do servidor (${res.status}).`,
    );
  }
  if (!res.ok) {
    throw new Error(data.error ?? `Erro ${res.status}`);
  }
  if (data.status === "error" && data.error) {
    throw new Error(data.error);
  }
  return data;
}

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
  const [state, setState] = useState<ChunkedSyncStatus>(IDLE);
  const [pending, setPending] = useState(false);
  const [incremental, setIncremental] = useState(false);
  const abortRef = useRef(false);
  const runningRef = useRef(false);

  const invalidateMetrics = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["metrics-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["treasury"] });
  }, [queryClient]);

  const callSync = useCallback(
    async (action: "start" | "step" | "cancel") => {
      const res = await fetch(`/api/stores/${storeId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      return parseSyncResponse(res);
    },
    [storeId],
  );

  const runLoop = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    abortRef.current = false;
    setPending(true);

    try {
      let status = await callSync("start");
      setState(status);
      setIncremental(Boolean(status.incremental));

      while (status.continue && !abortRef.current) {
        try {
          status = await callSync("step");
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (msg.includes("limite Vercel") && !abortRef.current) {
            await new Promise((r) => setTimeout(r, 800));
            status = await callSync("step");
          } else {
            throw e;
          }
        }
        setState(status);
        setIncremental(Boolean(status.incremental));
      }

      if (status.status === "done") {
        invalidateMetrics();
        onDone?.();
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: e instanceof Error ? e.message : "Falha na sincronização.",
        continue: false,
      }));
    } finally {
      setPending(false);
      runningRef.current = false;
    }
  }, [callSync, invalidateMetrics, onDone]);

  const handleCancel = useCallback(async () => {
    abortRef.current = true;
    try {
      const status = await callSync("cancel");
      setState(status);
    } catch {
      setState(IDLE);
    } finally {
      setPending(false);
      runningRef.current = false;
    }
  }, [callSync]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/stores/${storeId}/sync`, {
          cache: "no-store",
        });
        if (cancelled) return;
        let data: ChunkedSyncStatus;
        try {
          data = await parseSyncResponse(res);
        } catch {
          return;
        }
        if (data.status === "running" && data.continue) {
          setState(data);
          setIncremental(Boolean(data.incremental));
          setPending(true);
          runningRef.current = true;
          abortRef.current = false;

          let status = data;
          while (status.continue && !abortRef.current && !cancelled) {
            try {
              status = await callSync("step");
            } catch (e) {
              const msg = e instanceof Error ? e.message : "";
              if (msg.includes("limite Vercel") && !abortRef.current) {
                await new Promise((r) => setTimeout(r, 800));
                status = await callSync("step");
              } else {
                throw e;
              }
            }
            if (cancelled) return;
            setState(status);
            setIncremental(Boolean(status.incremental));
          }

          if (status.status === "done") {
            invalidateMetrics();
            onDone?.();
          }
        } else if (data.status === "done" && data.resultSummary) {
          setState(data);
          setIncremental(Boolean(data.incremental));
        } else {
          setIncremental(Boolean(data.incremental));
        }
      } catch {
        /* ignorar — utilizador pode iniciar manualmente */
      } finally {
        if (!cancelled) {
          setPending(false);
          runningRef.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
      abortRef.current = true;
    };
  }, [storeId, callSync, invalidateMetrics, onDone]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (runningRef.current || pending) return;
      void (async () => {
        try {
          const res = await fetch(`/api/stores/${storeId}/sync`, {
            cache: "no-store",
          });
          const data = await parseSyncResponse(res);
          if (data.status === "done" && data.resultSummary) {
            setState(data);
            setIncremental(Boolean(data.incremental));
          } else if (data.status === "running" && data.continue) {
            setState(data);
            setIncremental(Boolean(data.incremental));
          }
        } catch {
          /* ignorar */
        }
      })();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [storeId, pending]);

  const syncing = pending || state.status === "running";
  const progress = Math.min(100, Math.max(0, state.progress));

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={syncing}
          onClick={() => void runLoop()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          {syncing
            ? state.message || "A sincronizar…"
            : incremental
              ? "Atualizar dados"
              : "Sincronizar agora"}
        </button>
        {syncing && (
          <button
            type="button"
            onClick={() => void handleCancel()}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </button>
        )}
      </div>

      {syncing && (
        <div className="w-full min-w-[12rem] max-w-sm space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{state.message || "A sincronizar…"}</span>
            <span className="shrink-0 tabular-nums">{Math.round(progress)}%</span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {state.status === "done" && state.resultSummary && (
        <span className="text-xs text-positive">{state.resultSummary}</span>
      )}
      {state.status === "error" && state.error && (
        <span className="text-xs text-negative">{state.error}</span>
      )}
    </div>
  );
}
