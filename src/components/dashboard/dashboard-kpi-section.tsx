"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryKpi } from "@/lib/metrics";
import { combineKpisForPanel, orderKpisForPanel } from "@/lib/metric-panel";
import { DashboardKpiCard } from "@/components/dashboard/dashboard-kpi-card";

/** Ordem e conjunto dos KPIs primários (dashboard limpo). */
const PRIMARY_KPI_ORDER = [
  "Net Profit",
  "Faturamento",
  "Revenue",
  "Ad Spend",
  "ROAS",
] as const;

function splitPrimarySecondary(kpis: SummaryKpi[]): {
  primary: SummaryKpi[];
  secondaryFromPrimary: SummaryKpi[];
} {
  const byLabel = new Map(kpis.map((k) => [k.label, k]));
  const primary: SummaryKpi[] = [];
  for (const label of PRIMARY_KPI_ORDER) {
    const row = byLabel.get(label);
    if (row) primary.push(row);
  }
  const primaryLabels = new Set(primary.map((k) => k.label));
  const secondaryFromPrimary = kpis.filter((k) => !primaryLabels.has(k.label));
  return { primary, secondaryFromPrimary };
}

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

  const { primary, secondaryFromPrimary } = useMemo(
    () => splitPrimarySecondary(kpis),
    [kpis],
  );

  const secondaryKpis = useMemo(
    () => [...secondaryFromPrimary, ...extendedKpis],
    [secondaryFromPrimary, extendedKpis],
  );

  const hasMore =
    !customPanel &&
    secondaryKpis.length > 0 &&
    (showExtended ?? true);

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
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
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
      <div className="space-y-3">
        {hasMore && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {open ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  Ver menos
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  Mais métricas
                </>
              )}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {primary.map((k) => (
            <DashboardKpiCard
              key={k.label}
              {...k}
              layout={isStore ? "store" : "workspace"}
              emphasis={emphasizeLabel === k.label}
              density="primary"
            />
          ))}
        </div>
      </div>

      {open && hasMore && (
        <div className="space-y-3">
          {(sessionCountryLabel || funnelError) && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {sessionCountryLabel ? (
                <div
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                  data-sensitive
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  Sessões: {sessionCountryLabel}
                </div>
              ) : (
                <span />
              )}
              {funnelError && (
                <p className="text-xs text-muted-foreground">{funnelError}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {secondaryKpis.map((k) => (
              <DashboardKpiCard
                key={k.label}
                {...k}
                layout="workspace"
                density="secondary"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
