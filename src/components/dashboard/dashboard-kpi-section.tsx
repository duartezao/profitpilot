"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import type { SummaryKpi } from "@/lib/metrics";
import { StoreKpiCard } from "@/components/dashboard/store-kpi-card";
import { KpiCard } from "@/components/ui/kpi-card";

export function DashboardKpiSection({
  kpis,
  extendedKpis = [],
  funnelError,
  sessionCountryLabel,
  variant = "store",
}: {
  kpis: SummaryKpi[];
  extendedKpis?: SummaryKpi[];
  funnelError?: string | null;
  sessionCountryLabel?: string | null;
  /** store = cards com ícones; workspace = cards consolidados */
  variant?: "store" | "workspace";
}) {
  const [open, setOpen] = useState(false);
  const hasMore = extendedKpis.length > 0;
  const Card = variant === "store" ? StoreKpiCard : KpiCard;

  const primaryCols =
    variant === "store"
      ? "grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6";

  const extendedCols =
    variant === "store"
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          KPIs principais do período
        </p>
        {hasMore && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {open ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Ver menos
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Ver mais métricas
              </>
            )}
          </button>
        )}
      </div>

      <div className={`grid gap-4 ${primaryCols}`}>
        {kpis.map((k) => (
          <Card key={k.label} {...k} />
        ))}
      </div>

      {open && hasMore && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Todas as métricas</h2>
              <p className="text-xs text-muted-foreground">
                Custos, encomendas, funil Shopify e eficiência de ads.
              </p>
            </div>
            {sessionCountryLabel && (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />
                <Sensitive>Sessões: {sessionCountryLabel}</Sensitive>
              </div>
            )}
          </div>

          {funnelError && (
            <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {funnelError}
            </p>
          )}

          <div className={`grid gap-4 ${extendedCols}`}>
            {extendedKpis.map((k) => (
              <Card key={k.label} {...k} />
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            <strong className="font-medium text-foreground">BER</strong> =
            Break-even ROAS — o ROAS mínimo para não perderes dinheiro depois
            de COGS, envio e taxas. Se o ROAS real estiver abaixo do BER, estás
            em prejuízo.
          </p>
        </div>
      )}
    </div>
  );
}
