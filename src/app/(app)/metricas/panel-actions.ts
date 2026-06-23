"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getMetricPanelPreferencesForUser,
  saveMetricPanelPreferencesForUser,
} from "@/lib/metric-panel-prefs";
import {
  normalizeMetricPanelPreferences,
  type MetricPanelPreferences,
} from "@/lib/metric-panel";

export type MetricPanelActionState = {
  ok?: boolean;
  error?: string;
  prefs?: MetricPanelPreferences;
};

export async function loadMetricPanelPreferencesAction(): Promise<MetricPanelPreferences> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return getMetricPanelPreferencesForUser(user.id, user.workspaceId);
}

export async function saveMetricPanelPreferencesAction(
  prefs: MetricPanelPreferences,
): Promise<MetricPanelActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  try {
    const saved = await saveMetricPanelPreferencesForUser(
      user.id,
      user.workspaceId,
      normalizeMetricPanelPreferences(prefs),
    );
    return { ok: true, prefs: saved };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Não foi possível guardar.",
    };
  }
}
