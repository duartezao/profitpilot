"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LayoutGrid, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_METRIC_PANEL,
  METRIC_CATALOG,
  METRIC_CATEGORY_LABEL,
  METRIC_PANEL_PRESETS,
  metricDefinition,
  moveMetricInOrder,
  preferencesMatchPreset,
  type MetricCategory,
  type MetricPanelPreferences,
  type MetricPanelPresetId,
} from "@/lib/metric-panel";

const CATEGORY_ORDER: MetricCategory[] = [
  "lucro",
  "vendas",
  "custos",
  "ads",
  "funil",
];

function PresetButton({
  active,
  name,
  description,
  onClick,
}: {
  active: boolean;
  name: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-left transition-colors",
        active
          ? "border-accent bg-accent/10"
          : "border-border hover:bg-muted",
      )}
    >
      <p className="text-sm font-medium">{name}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

export function MetricsPanelConfig({
  prefs,
  onSave,
  saving = false,
}: {
  prefs: MetricPanelPreferences;
  onSave: (next: MetricPanelPreferences) => void | Promise<void>;
  saving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(prefs);

  const grouped = useMemo(() => {
    const map = new Map<MetricCategory, typeof METRIC_CATALOG>();
    for (const cat of CATEGORY_ORDER) {
      map.set(
        cat,
        METRIC_CATALOG.filter((m) => m.category === cat),
      );
    }
    return map;
  }, []);

  const orderedVisible = useMemo(
    () =>
      draft.orderedIds
        .map((id) => metricDefinition(id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [draft.orderedIds],
  );

  const openDialog = () => {
    setDraft(prefs);
    setOpen(true);
  };

  const applyPreset = (presetId: MetricPanelPresetId) => {
    const preset = METRIC_PANEL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setDraft({ presetId, orderedIds: [...preset.metricIds] });
  };

  const handleToggle = (metricId: string, checked: boolean) => {
    setDraft((current) => {
      const orderedIds = checked
        ? current.orderedIds.includes(metricId)
          ? current.orderedIds
          : [...current.orderedIds, metricId]
        : current.orderedIds.filter((id) => id !== metricId);
      return {
        presetId: preferencesMatchPreset({ presetId: "custom", orderedIds }),
        orderedIds,
      };
    });
  };

  const move = (metricId: string, direction: "up" | "down") => {
    setDraft((current) => ({
      ...current,
      presetId: "custom",
      orderedIds: moveMetricInOrder(current.orderedIds, metricId, direction),
    }));
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        <LayoutGrid className="h-4 w-4" />
        Personalizar painel
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="metric-panel-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-xl border border-border bg-surface sm:rounded-lg">
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div>
                <h2
                  id="metric-panel-title"
                  className="text-lg font-semibold tracking-tight"
                >
                  Painel de métricas
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Presets, métricas visíveis e ordem — guardado na tua conta.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border p-1.5 hover:bg-muted"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Presets
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {METRIC_PANEL_PRESETS.map((preset) => (
                    <PresetButton
                      key={preset.id}
                      active={draft.presetId === preset.id}
                      name={preset.name}
                      description={preset.description}
                      onClick={() => applyPreset(preset.id)}
                    />
                  ))}
                </div>
              </div>

              {orderedVisible.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Ordem no painel
                  </p>
                  <ul className="space-y-1 rounded-lg border border-border">
                    {orderedVisible.map((m, idx) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 last:border-b-0"
                      >
                        <span className="text-sm font-medium">{m.label}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => move(m.id, "up")}
                            className="rounded border border-border p-1 hover:bg-muted disabled:opacity-40"
                            aria-label={`Subir ${m.label}`}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === orderedVisible.length - 1}
                            onClick={() => move(m.id, "down")}
                            className="rounded border border-border p-1 hover:bg-muted disabled:opacity-40"
                            aria-label={`Descer ${m.label}`}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Métricas disponíveis
                  {draft.presetId === "custom" && (
                    <span className="ml-1 text-foreground">(personalizado)</span>
                  )}
                </p>
                {CATEGORY_ORDER.map((cat) => {
                  const items = grouped.get(cat) ?? [];
                  if (!items.length) return null;
                  return (
                    <div key={cat}>
                      <p className="mb-2 text-sm font-medium">
                        {METRIC_CATEGORY_LABEL[cat]}
                      </p>
                      <ul className="space-y-2">
                        {items.map((m) => {
                          const checked = draft.orderedIds.includes(m.id);
                          return (
                            <li key={m.id}>
                              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted/50">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    handleToggle(m.id, e.target.checked)
                                  }
                                  className="mt-0.5 h-4 w-4 rounded border-border"
                                />
                                <span>
                                  <span className="text-sm font-medium">
                                    {m.label}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {m.description}
                                  </span>
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setDraft({ ...DEFAULT_METRIC_PANEL })}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Repor defeito
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  await onSave(draft);
                  setOpen(false);
                }}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
