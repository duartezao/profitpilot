import "server-only";
import mongoose, { Types } from "mongoose";
import { CampaignScaleEvent } from "@/models/CampaignScaleEvent";
import { AdCampaignDay } from "@/models/AdCampaignDay";
import {
  metricsFromSpendDays,
  type CampaignAnalysisWindow,
} from "@/lib/campaign-analysis";
import { roasFromCampaign } from "@/lib/ad-campaign-types";
import type { AdPlatform } from "@/lib/ad-spend-platforms";

/** Regista scale quando o budget diário sobe face ao dia anterior. */
export async function recordCampaignBudgetScaleIfNeeded(input: {
  workspaceId: Types.ObjectId;
  storeId: Types.ObjectId;
  adAccountId: Types.ObjectId;
  adAccountName: string;
  platform: AdPlatform;
  campaignId: string;
  campaignName: string;
  dateKey: string;
  newBudget: number;
  currency: string;
  analysisWindow?: CampaignAnalysisWindow;
}): Promise<void> {
  if (input.newBudget <= 0) return;

  const prev = await AdCampaignDay.findOne({
    storeId: input.storeId,
    adAccountId: input.adAccountId,
    platform: input.platform,
    campaignId: input.campaignId,
    dateKey: { $lt: input.dateKey },
    dailyBudget: { $gt: 0 },
  })
    .sort({ dateKey: -1 })
    .select("dailyBudget dateKey")
    .lean();

  if (!prev?.dailyBudget || prev.dailyBudget >= input.newBudget) return;

  const windowDays = input.analysisWindow ?? 7;
  const preRows = await AdCampaignDay.find({
    storeId: input.storeId,
    adAccountId: input.adAccountId,
    platform: input.platform,
    campaignId: input.campaignId,
    dateKey: { $lt: input.dateKey },
    spend: { $gt: 0 },
  })
    .sort({ dateKey: -1 })
    .limit(windowDays)
    .select("spend conversions conversionValue impressions clicks")
    .lean();

  const preDays = preRows.map((r) => ({
    dateKey: r.dateKey,
    spend: r.spend ?? 0,
    impressions: r.impressions ?? 0,
    clicks: r.clicks ?? 0,
    conversions: r.conversions ?? 0,
    conversionValue: r.conversionValue ?? 0,
    dailyBudget: null,
  }));
  const pre = metricsFromSpendDays(preDays);

  await CampaignScaleEvent.findOneAndUpdate(
    {
      storeId: input.storeId,
      adAccountId: input.adAccountId,
      platform: input.platform,
      campaignId: input.campaignId,
      dateKey: input.dateKey,
    },
    {
      $setOnInsert: {
        workspaceId: input.workspaceId,
        storeId: input.storeId,
        adAccountId: input.adAccountId,
        platform: input.platform,
        campaignId: input.campaignId,
        campaignName: input.campaignName,
        adAccountName: input.adAccountName,
        dateKey: input.dateKey,
        previousBudget: prev.dailyBudget,
        newBudget: input.newBudget,
        currency: input.currency,
        preSpendDays: preDays.length,
        preSpend: pre.spend,
        preConversions: pre.conversions,
        preRoas: roasFromCampaign(pre.spend, pre.conversionValue),
        detectedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function listRecentScaleEvents(
  storeId: string,
  limit = 20,
): Promise<
  Array<{
    campaignName: string;
    adAccountName: string;
    platform: AdPlatform;
    dateKey: string;
    previousBudget: number;
    newBudget: number;
    currency: string;
    preRoas: number | null;
    preConversions: number;
  }>
> {
  const rows = await CampaignScaleEvent.find({
    storeId: new mongoose.Types.ObjectId(storeId),
  })
    .sort({ dateKey: -1 })
    .limit(limit)
    .lean();

  return rows.map((r) => ({
    campaignName: r.campaignName ?? "Campanha",
    adAccountName: r.adAccountName ?? "",
    platform: r.platform as AdPlatform,
    dateKey: r.dateKey,
    previousBudget: r.previousBudget,
    newBudget: r.newBudget,
    currency: r.currency ?? "EUR",
    preRoas: r.preRoas ?? null,
    preConversions: r.preConversions ?? 0,
  }));
}
