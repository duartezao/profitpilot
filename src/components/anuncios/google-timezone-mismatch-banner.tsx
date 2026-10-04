"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { alignStoreTimezoneToGoogleAction } from "@/app/(app)/anuncios/ad-account-actions";

export function GoogleTimezoneMismatchBanner({
  storeId,
  storeTimezone,
  googleTimezone,
  canEdit,
  onAligned,
}: {
  storeId: string;
  storeTimezone: string;
  googleTimezone: string;
  canEdit: boolean;
  onAligned?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>
          Fuso da loja (<span className="font-medium">{storeTimezone}</span>)
          {" ≠ "}
          fuso da conta Google (
          <span className="font-medium">{googleTimezone}</span>
          ). Os dias de ads e vendas podem não bater — o ROAS do dia fica
          torto.
        </p>
      </div>
      {canEdit && (
        <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await alignStoreTimezoneToGoogleAction(storeId);
                if (res.error) {
                  setError(res.error);
                  return;
                }
                onAligned?.();
              });
            }}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "A alinhar…" : "Usar fuso da conta Google"}
          </button>
          {error && <p className="text-xs text-negative">{error}</p>}
        </div>
      )}
    </div>
  );
}
