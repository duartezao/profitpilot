import "server-only";
import mongoose, { Types } from "mongoose";
import { CampaignPauseEvent } from "@/models/CampaignPauseEvent";
import { AdCampaignDay } from "@/models/AdCampaignDay";
import {
  isActiveCampaignStatus,
  isPausedCampaignStatus,
  roasFromCampaign,
} from "@/lib/ad-campaign-types";
import { metricsFromSpendDays } from "@/lib/campaign-analysis-core";
import type { CampaignAnalysisWindow } from "@/lib/campaign-analysis-core-types";
import { roasChangeVerdict } from "@/lib/campaign-analysis-core";
import type { AdPlatform } from "@/lib/ad-spend-platforms";
import { formatDateInput } from "@/lib/period";

const DEFAULT_WINDOW: CampaignAnalysisWindow = 7;

function aggregateAccountDays(
  rows: Array<{
    dateKey: string;
    spend: number;
    conversions: number;
    conversionValue: number;
    impressions: number;
    clicks: number;
  }>,
): Map<
  string,
  {
    spend: number;
    conversions: number;
    conversionValue: number;
    impressions: number;
    clicks: number;
  }
> {
  const byDay = new Map<
    string,
    {
      spend: number;
      conversions: number;
      conversionValue: number;
      impressions: number;
      clicks: number;
    }
  >();
  for (const r of rows) {
    const prev = byDay.get(r.dateKey) ?? {
      spend: 0,
      conversions: 0,
      conversionValue: 0,
      impressions: 0,
      clicks: 0,
    };
    prev.spend += r.spend;
    prev.conversions += r.conversions;
    prev.conversionValue += r.conversionValue;
    prev.impressions += r.impressions;
    prev.clicks += r.clicks;
    byDay.set(r.dateKey, prev);
  }
  return byDay;
}

async function loadPrePauseMetrics(input: {
  storeId: Types.ObjectId;
  adAccountId: Types.ObjectId;
  platform: AdPlatform;
  campaignId: string;
  pauseDateKey: string;
  windowDays?: CampaignAnalysisWindow;
}) {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW;

  const campaignRows = await AdCampaignDay.find({
    storeId: input.storeId,
    adAccountId: input.adAccountId,
    platform: input.platform,
    campaignId: input.campaignId,
    dateKey: { $lt: input.pauseDateKey },
    spend: { $gt: 0 },
  })
    .sort({ dateKey: -1 })
    .limit(windowDays)
    .select("dateKey spend conversions conversionValue impressions clicks")
    .lean();

  const accountRows = await AdCampaignDay.find({
    storeId: input.storeId,
    adAccountId: input.adAccountId,
    platform: input.platform,
    dateKey: { $lt: input.pauseDateKey },
    spend: { $gt: 0 },
  })
    .select("dateKey spend conversions conversionValue impressions clicks")
    .lean();

  const accountByDay = aggregateAccountDays(
    accountRows.map((r) => ({
      dateKey: r.dateKey,
      spend: r.spend ?? 0,
      conversions: r.conversions ?? 0,
      conversionValue: r.conversionValue ?? 0,
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
    })),
  );
  const accountDayKeys = [...accountByDay.keys()].sort().slice(-windowDays);
  const accountSpendDays = accountDayKeys.map((dk) => {
    const d = accountByDay.get(dk)!;
    return {
      dateKey: dk,
      spend: d.spend,
      impressions: d.impressions,
      clicks: d.clicks,
      conversions: d.conversions,
      conversionValue: d.conversionValue,
      dailyBudget: null,
    };
  });

  const campaignDays = campaignRows.map((r) => ({
    dateKey: r.dateKey,
    spend: r.spend ?? 0,
    impressions: r.impressions ?? 0,
    clicks: r.clicks ?? 0,
    conversions: r.conversions ?? 0,
    conversionValue: r.conversionValue ?? 0,
    dailyBudget: null,
  }));

  const preCampaign = metricsFromSpendDays(campaignDays);
  const preAccount = metricsFromSpendDays(accountSpendDays);

  return {
    preSpendDays: campaignDays.length,
    preSpend: preCampaign.spend,
    preConversions: preCampaign.conversions,
    preRoas: roasFromCampaign(preCampaign.spend, preCampaign.conversionValue),
    preAccountSpendDays: accountSpendDays.length,
    preAccountSpend: preAccount.spend,
    preAccountConversions: preAccount.conversions,
    preAccountRoas: roasFromCampaign(preAccount.spend, preAccount.conversionValue),
  };
}

/** Deteta transição activa → pausada e regista o evento. */
export async function recordCampaignPauseIfNeeded(input: {
  workspaceId: Types.ObjectId;
  storeId: Types.ObjectId;
  adAccountId: Types.ObjectId;
  adAccountName: string;
  platform: AdPlatform;
  campaignId: string;
  campaignName: string;
  dateKey: string;
  newStatus: string;
  previousStatus?: string | null;
}): Promise<void> {
  if (!isPausedCampaignStatus(input.newStatus)) return;

  const prevStatus = input.previousStatus ?? "";
  if (isPausedCampaignStatus(prevStatus)) return;

  const prevRow = await AdCampaignDay.findOne({
    storeId: input.storeId,
    adAccountId: input.adAccountId,
    platform: input.platform,
    campaignId: input.campaignId,
    dateKey: { $lt: input.dateKey },
  })
    .sort({ dateKey: -1 })
    .select("status spend")
    .lean();

  const hadActivity =
    (prevRow && (prevRow.spend ?? 0) > 0) ||
    isActiveCampaignStatus(prevStatus) ||
    (prevRow != null && isActiveCampaignStatus(prevRow.status ?? ""));

  if (!hadActivity && !prevRow) return;

  if (
    prevRow &&
    isPausedCampaignStatus(prevRow.status ?? "") &&
    (prevRow.spend ?? 0) <= 0
  ) {
    return;
  }

  const pre = await loadPrePauseMetrics({
    storeId: input.storeId,
    adAccountId: input.adAccountId,
    platform: input.platform,
    campaignId: input.campaignId,
    pauseDateKey: input.dateKey,
  });

  await CampaignPauseEvent.findOneAndUpdate(
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
        ...pre,
        detectedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export type PostPauseAccountVerdict = "better" | "worse" | "same" | "early";

/** Compara ROAS da conta nos dias após a pausa (campanha deixa de gastar). */
export async function computePostPauseAccountMetrics(input: {
  storeId: Types.ObjectId | string;
  adAccountId: Types.ObjectId | string;
  platform: AdPlatform;
  campaignId: string;
  pauseDateKey: string;
  preAccountRoas: number | null;
  maxDays?: number;
}): Promise<{
  accountSpendDays: number;
  accountSpend: number;
  accountConversions: number;
  accountRoas: number | null;
  campaignSpend: number;
  verdict: PostPauseAccountVerdict;
} | null> {
  const storeOid =
    typeof input.storeId === "string"
      ? new mongoose.Types.ObjectId(input.storeId)
      : input.storeId;
  const accountOid =
    typeof input.adAccountId === "string"
      ? new mongoose.Types.ObjectId(input.adAccountId)
      : input.adAccountId;

  const todayKey = formatDateInput(new Date());
  const maxDays = input.maxDays ?? DEFAULT_WINDOW;

  const rows = await AdCampaignDay.find({
    storeId: storeOid,
    adAccountId: accountOid,
    platform: input.platform,
    dateKey: { $gt: input.pauseDateKey, $lte: todayKey },
    spend: { $gt: 0 },
  })
    .select(
      "dateKey campaignId spend conversions conversionValue impressions clicks",
    )
    .lean();

  if (!rows.length) return null;

  const accountByDay = aggregateAccountDays(
    rows.map((r) => ({
      dateKey: r.dateKey,
      spend: r.spend ?? 0,
      conversions: r.conversions ?? 0,
      conversionValue: r.conversionValue ?? 0,
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
    })),
  );

  const dayKeys = [...accountByDay.keys()].sort().slice(0, maxDays);
  if (!dayKeys.length) return null;

  const accountDays = dayKeys.map((dk) => {
    const d = accountByDay.get(dk)!;
    return {
      dateKey: dk,
      spend: d.spend,
      impressions: d.impressions,
      clicks: d.clicks,
      conversions: d.conversions,
      conversionValue: d.conversionValue,
      dailyBudget: null,
    };
  });

  const pausedCampaignSpend = rows
    .filter(
      (r) => r.campaignId === input.campaignId && dayKeys.includes(r.dateKey),
    )
    .reduce((s, r) => s + (r.spend ?? 0), 0);

  const account = metricsFromSpendDays(accountDays);
  const accountRoas = roasFromCampaign(account.spend, account.conversionValue);
  const preRoas = input.preAccountRoas;

  const verdict = roasChangeVerdict(
    preRoas,
    accountRoas,
    dayKeys.length,
  ) as PostPauseAccountVerdict;

  return {
    accountSpendDays: dayKeys.length,
    accountSpend: account.spend,
    accountConversions: account.conversions,
    accountRoas,
    campaignSpend: pausedCampaignSpend,
    verdict,
  };
}

export async function listRecentPauseEvents(
  storeId: string,
  limit = 20,
): Promise<
  Array<{
    campaignId: string;
    campaignName: string;
    adAccountName: string;
    platform: AdPlatform;
    dateKey: string;
    preRoas: number | null;
    preConversions: number;
    preAccountRoas: number | null;
    postPause?: Awaited<ReturnType<typeof computePostPauseAccountMetrics>>;
  }>
> {
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const rows = await CampaignPauseEvent.find({ storeId: storeOid })
    .sort({ dateKey: -1 })
    .limit(limit)
    .lean();

  const out: Awaited<ReturnType<typeof listRecentPauseEvents>> = [];
  for (const r of rows) {
    const postPause = await computePostPauseAccountMetrics({
      storeId: storeOid,
      adAccountId: r.adAccountId,
      platform: r.platform as AdPlatform,
      campaignId: r.campaignId,
      pauseDateKey: r.dateKey,
      preAccountRoas: r.preAccountRoas ?? null,
    });
    out.push({
      campaignId: r.campaignId,
      campaignName: r.campaignName ?? "Campanha",
      adAccountName: r.adAccountName ?? "",
      platform: r.platform as AdPlatform,
      dateKey: r.dateKey,
      preRoas: r.preRoas ?? null,
      preConversions: r.preConversions ?? 0,
      preAccountRoas: r.preAccountRoas ?? null,
      postPause: postPause ?? undefined,
    });
  }
  return out;
}

export async function loadLatestPauseMap(
  storeId: string,
  adAccountIds: string[],
): Promise<
  Map<
    string,
    {
      dateKey: string;
      preSpendDays: number;
      preSpend: number;
      preConversions: number;
      preRoas: number | null;
      preAccountRoas: number | null;
      postPause?: Awaited<ReturnType<typeof computePostPauseAccountMetrics>>;
    }
  >
> {
  const out = new Map<
    string,
    {
      dateKey: string;
      preSpendDays: number;
      preSpend: number;
      preConversions: number;
      preRoas: number | null;
      preAccountRoas: number | null;
      postPause?: Awaited<ReturnType<typeof computePostPauseAccountMetrics>>;
    }
  >();
  if (!adAccountIds.length) return out;

  const storeOid = new mongoose.Types.ObjectId(storeId);
  const accountOids = adAccountIds.map((id) => new mongoose.Types.ObjectId(id));

  const rows = await CampaignPauseEvent.find({
    storeId: storeOid,
    adAccountId: { $in: accountOids },
  })
    .sort({ dateKey: -1 })
    .lean();

  for (const r of rows) {
    const key = `${r.platform}:${String(r.adAccountId)}:${r.campaignId}`;
    if (out.has(key)) continue;

    const postPause = await computePostPauseAccountMetrics({
      storeId: storeOid,
      adAccountId: r.adAccountId,
      platform: r.platform as AdPlatform,
      campaignId: r.campaignId,
      pauseDateKey: r.dateKey,
      preAccountRoas: r.preAccountRoas ?? null,
    });

    out.set(key, {
      dateKey: r.dateKey,
      preSpendDays: r.preSpendDays ?? 0,
      preSpend: r.preSpend ?? 0,
      preConversions: r.preConversions ?? 0,
      preRoas: r.preRoas ?? null,
      preAccountRoas: r.preAccountRoas ?? null,
      postPause: postPause ?? undefined,
    });
  }

  return out;
}
