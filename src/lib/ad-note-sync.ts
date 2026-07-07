import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { DailyNote } from "@/models/DailyNote";
import { loadStoreAdMetricsForDay } from "@/lib/ad-campaign-metrics";
import {
  buildCampaignDecisions,
  buildCampaignSuggestionText,
  pickBestCampaign,
} from "@/lib/campaign-decision";
import { startOfDay, endOfDay, parseDateInput } from "@/lib/period";

/** Preenche snapshot API na nota diária (CPC/CTR/CPM + sugestão de campanhas). */
export async function syncApiMetricsToDailyNote(
  workspaceId: string,
  storeId: string,
  dateKey: string,
): Promise<void> {
  await connectToDatabase();
  const metrics = await loadStoreAdMetricsForDay(storeId, dateKey);
  if (!metrics) return;

  const day = parseDateInput(dateKey);
  if (!day) return;
  const noteDate = startOfDay(day);
  const dayEnd = endOfDay(noteDate);

  const campaignRows = buildCampaignDecisions(metrics.campaigns);
  const best = pickBestCampaign(campaignRows);
  const suggestion = buildCampaignSuggestionText(campaignRows);

  const wsOid = new mongoose.Types.ObjectId(workspaceId);
  const storeOid = new mongoose.Types.ObjectId(storeId);

  const apiSnapshot = {
    cpc: metrics.total.cpc,
    ctr: metrics.total.ctr,
    cpm: metrics.total.cpm,
    currency: metrics.byPlatform[0]?.currency ?? "USD",
    bestCampaign: best?.name ?? "",
    campaignSuggestion: suggestion ?? "",
    syncedAt: new Date(),
  };

  const existing = await DailyNote.findOne({
    workspaceId: wsOid,
    storeId: storeOid,
    date: { $gte: noteDate, $lte: dayEnd },
  });

  if (existing) {
    await DailyNote.updateOne(
      { _id: existing._id },
      { $set: { apiSnapshot } },
    );
  } else {
    await DailyNote.create({
      workspaceId: wsOid,
      storeId: storeOid,
      date: noteDate,
      didScale: false,
      text: "",
      apiSnapshot,
    });
  }
}
