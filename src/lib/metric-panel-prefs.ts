import "server-only";
import mongoose from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { Membership } from "@/models/Membership";
import {
  DEFAULT_METRIC_PANEL,
  normalizeMetricPanelPreferences,
  type MetricPanelPreferences,
} from "@/lib/metric-panel";

const panelSchema = z.object({
  presetId: z.enum([
    "completo",
    "dropshipping",
    "lucro",
    "funil",
    "ads",
    "custom",
  ]),
  orderedIds: z.array(z.string()).min(1),
});

export async function getMetricPanelPreferencesForUser(
  userId: string,
  workspaceId: string,
): Promise<MetricPanelPreferences> {
  await connectToDatabase();
  const membership = await Membership.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    status: "active",
  })
    .select("metricsPanel")
    .lean();

  const raw = membership?.metricsPanel as
    | Partial<MetricPanelPreferences>
    | null
    | undefined;

  if (!raw) return { ...DEFAULT_METRIC_PANEL };
  return normalizeMetricPanelPreferences(raw);
}

export async function saveMetricPanelPreferencesForUser(
  userId: string,
  workspaceId: string,
  prefs: MetricPanelPreferences,
): Promise<MetricPanelPreferences> {
  const parsed = panelSchema.safeParse(normalizeMetricPanelPreferences(prefs));
  if (!parsed.success) {
    throw new Error("Preferências de painel inválidas.");
  }

  await connectToDatabase();
  const result = await Membership.updateOne(
    {
      userId: new mongoose.Types.ObjectId(userId),
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      status: "active",
    },
    { $set: { metricsPanel: parsed.data } },
  );

  if (result.matchedCount === 0) {
    throw new Error("Sem acesso a este workspace.");
  }

  return normalizeMetricPanelPreferences(parsed.data);
}
