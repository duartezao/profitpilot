"use client";

import { useState, useTransition } from "react";
import { Database } from "lucide-react";
import { backfillDailyMetricsAction } from "@/app/(app)/metricas/backfill-actions";

export function BackfillSnapshotsButton({ storeId }: { storeId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const res = await backfillDailyMetricsAction(storeId);
            if (res.error) setResult({ type: "error", text: res.error });
            else if (res.ok)
              setResult({
                type: "ok",
                text: `${res.created} criados · ${res.exists} já existiam · ${res.daysProcessed} dias`,
              });
          });
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        <Database className={`h-4 w-4 ${pending ? "animate-pulse" : ""}`} />
        {pending ? "A preencher…" : "Backfill snapshots"}
      </button>
      {result && (
        <p
          className={`max-w-xs text-right text-xs ${result.type === "error" ? "text-negative" : "text-muted-foreground"}`}
        >
          {result.text}
        </p>
      )}
    </div>
  );
}
