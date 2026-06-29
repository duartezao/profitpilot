"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryKpi } from "@/lib/metrics";
import { combineKpisForPanel, orderKpisForPanel } from "@/lib/metric-panel";
import { DashboardKpiCard } from "@/components/dashboard/dashboard-kpi-card";

export function DashboardKpiSection({
  kpis,
  extendedKpis = [],
  funnelError,
  sessionCountryLabel,
  variant = "store",
  showExtended,
  orderedMetricIds,
  emphasizeLabel,
}: {
  kpis: SummaryKpi[];
  extendedKpis?: SummaryKpi[];
  funnelError?: string | null;
  sessionCountryLabel?: string | null;
  variant?: "store" | "workspace";
  /** Mostrar painel «Ver mais métricas» (ex. página /metricas) */
  showExtended?: boolean;
  /** Painel personalizado — filtra e ordena numa única grelha. */
  orderedMetricIds?: string[];
  /** Realça o card com este label (ex. "Net Profit"). */
  emphasizeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const isStore = variant === "store";
  const customPanel = Boolean(orderedMetricIds?.length);

  const allPanelKpis = useMemo(
    () => combineKpisForPanel(kpis, extendedKpis),
    [kpis, extendedKpis],
  );

  const customDisplayed = useMemo(() => {
    if (!customPanel || !orderedMetricIds) return [];
    return orderKpisForPanel(allPanelKpis, orderedMetricIds, { strict: true });
  }, [customPanel, orderedMetricIds, allPanelKpis]);

  const hasMore =
    !customPanel && extendedKpis.length > 0 && (showExtended ?? !isStore);

  const primaryCols = isStore
    ? "grid-cols-2 lg:grid-cols-4"
    : "grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6";

  const extendedCols =
    "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5";

  if (customPanel) {
    const hasFunnelInPanel = customDisplayed.some((k) =>
      ["Sessões", "ATC %", "Checkout %", "CVR %"].includes(k.label),
    );

    if (customDisplayed.length === 0) {
      return (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma métrica seleccionada. Usa «Personalizar painel» para escolher o
          que queres ver.
        </p>
      );
    }

    const missingCount =
      (orderedMetricIds?.length ?? 0) - customDisplayed.length;

    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {customDisplayed.length} métricas visíveis no teu painel.
          {missingCount > 0 &&
            ` ${missingCount} seleccionada(s) sem dados disponíveis neste período.`}
        </p>
        <div className={cn("grid gap-3 sm:gap-4", extendedCols)}>
          {customDisplayed.map((k) => (
            <DashboardKpiCard key={k.label} {...k} layout="workspace" />
          ))}
        </div>
        {hasFunnelInPanel && sessionCountryLabel && (
          <div
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground"
            data-sensitive
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            Sessões: {sessionCountryLabel}
          </div>
        )}
        {funnelError && hasFunnelInPanel && (
          <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {funnelError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isStore ? (
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
      ) : hasMore ? (
        <div className="flex justify-end">
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
        </div>
      ) : null}

      <div className={cn("grid gap-3 sm:gap-4", primaryCols)}>
        {kpis.map((k) => (
          <DashboardKpiCard
            key={k.label}
            {...k}
            layout={isStore ? "store" : "workspace"}
            emphasis={emphasizeLabel === k.label}
          />
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
              <div
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground"
                data-sensitive
              >
                <Globe className="h-3.5 w-3.5 shrink-0" />
                Sessões: {sessionCountryLabel}
              </div>
            )}
          </div>

          {funnelError && (
            <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {funnelError}
            </p>
          )}

          <div className={cn("grid gap-3 sm:gap-4", extendedCols)}>
            {extendedKpis.map((k) => (
              <DashboardKpiCard key={k.label} {...k} layout="workspace" />
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
