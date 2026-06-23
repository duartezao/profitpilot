"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_METRIC_PANEL,
  METRIC_PANEL_PRESETS,
  normalizeMetricPanelPreferences,
  storageKeyForMetricPanel,
  type MetricPanelPreferences,
  type MetricPanelPresetId,
} from "@/lib/metric-panel";
import {
  loadMetricPanelPreferencesAction,
  saveMetricPanelPreferencesAction,
} from "@/app/(app)/metricas/panel-actions";

export function useMetricPanelPreferences(
  workspaceId: string,
  initialPrefs?: MetricPanelPreferences,
) {
  const [prefs, setPrefs] = useState<MetricPanelPreferences>(
    initialPrefs ?? DEFAULT_METRIC_PANEL,
  );
  const [ready, setReady] = useState(Boolean(initialPrefs));

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    (async () => {
      try {
        const fromServer = await loadMetricPanelPreferencesAction();
        if (!cancelled) {
          setPrefs(normalizeMetricPanelPreferences(fromServer));
          localStorage.setItem(
            storageKeyForMetricPanel(workspaceId),
            JSON.stringify(fromServer),
          );
        }
      } catch {
        try {
          const raw = localStorage.getItem(storageKeyForMetricPanel(workspaceId));
          if (!cancelled && raw) {
            setPrefs(
              normalizeMetricPanelPreferences(
                JSON.parse(raw) as MetricPanelPreferences,
              ),
            );
          }
        } catch {
          if (!cancelled) setPrefs({ ...DEFAULT_METRIC_PANEL });
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const save = useCallback(
    async (next: MetricPanelPreferences) => {
      const normalized = normalizeMetricPanelPreferences(next);
      setPrefs(normalized);
      if (workspaceId) {
        localStorage.setItem(
          storageKeyForMetricPanel(workspaceId),
          JSON.stringify(normalized),
        );
      }
      const result = await saveMetricPanelPreferencesAction(normalized);
      if (result.prefs) {
        setPrefs(normalizeMetricPanelPreferences(result.prefs));
      }
      return result;
    },
    [workspaceId],
  );

  const applyPreset = useCallback(
    (presetId: MetricPanelPresetId) => {
      const preset = METRIC_PANEL_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      void save({ presetId, orderedIds: [...preset.metricIds] });
    },
    [save],
  );

  const reset = useCallback(() => {
    void save({ ...DEFAULT_METRIC_PANEL });
  }, [save]);

  return { prefs, ready, save, applyPreset, reset };
}
