import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { AdCampaignDay } from "@/models/AdCampaignDay";
import { AdCampaignTarget } from "@/models/AdCampaignTarget";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { buildCollectionMembershipRevenue } from "@/lib/collection-sales";
import { AD_PLATFORM_LABELS, type AdPlatform } from "@/lib/ad-spend-platforms";
import { formatCurrency } from "@/lib/utils";
import {
  addDays,
  formatDateInput,
  type PeriodInput,
  startOfDay,
} from "@/lib/period";
import {
  dateKeyInTimezone,
  dayKeysBetweenInTimezone,
  normalizeStoreTimezone,
  resolvePeriodForStore,
} from "@/lib/store-timezone";
import { NON_ARCHIVED_STORE_FILTER } from "@/lib/store-scope";
import { syncAdCampaignLandingsForStore } from "@/lib/ad-campaign-landing-sync";
import { extractCollectionHandlesFromUrls } from "@/lib/collection-url-match";
import { buildCollectionBriefingMessage, joinStoreBriefingMessages } from "@/lib/collection-briefing";
import { getStoreDisplayUrl } from "@/lib/store-display";
import { loadSyncAdAccountsForStore } from "@/lib/ad-accounts";

/** Máximo de dias para contar streak de actividade contínua. */
const ACTIVE_STREAK_LOOKBACK_DAYS = 365;

function normalizeCampaignId(raw: string): string {
  const t = String(raw ?? "").trim();
  const m = t.match(/campaigns\/(\d+)/i);
  if (m?.[1]) return m[1];
  return t;
}

export type CollectionRoasCampaign = {
  campaignId: string;
  campaignName: string;
  platform: AdPlatform;
  platformLabel: string;
  spend: number;
  spendFmt: string;
  landingUrls: string[];
  platformRoas: number | null;
  platformRoasFmt: string;
  /** Dias seguidos com spend > 0; 0 se a conta/campanha «caiu». */
  activeDays: number;
  activeDaysLabel: string;
};

export type CollectionRoasRow = {
  collectionId: string;
  collectionTitle: string;
  handle: string;
  units: number;
  revenue: number;
  revenueFmt: string;
  adSpend: number;
  adSpendFmt: string;
  realRoas: number | null;
  realRoasFmt: string;
  campaigns: CollectionRoasCampaign[];
  unmatched: boolean;
  /** Dias seguidos com spend > 0 em pelo menos uma campanha ligada. */
  activeDays: number;
  activeDaysLabel: string;
  /** Mensagem EN desta coleção (também incluída em storeBriefingText). */
  briefingText: string;
};

export type CollectionRoasReport = {
  storeName: string;
  storeDomain: string;
  adAccountLabel: string;
  periodLabel: string;
  periodFromLabel: string;
  periodToLabel: string;
  periodKey: string;
  currency: string;
  collections: CollectionRoasRow[];
  /** Todos os briefings da loja juntos (um bloco para copiar). */
  storeBriefingText: string;
  unmatchedCampaigns: CollectionRoasCampaign[];
  targetsSynced: number;
  urlsFound: number;
  landingSyncErrors: string[];
  lastLandingSyncAt: string | null;
};

function fmtRoas(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2).replace(".", ",")}×`;
}

function fmtActiveDays(n: number): string {
  if (n <= 0) return "0 dias activos";
  return n === 1 ? "1 dia activo" : `${n} dias activos`;
}

function prevDateKey(dateKey: string): string {
  const d = startOfDay(new Date(`${dateKey}T12:00:00`));
  return formatDateInput(addDays(d, -1));
}

/**
 * Conta dias seguidos com spend > 0 a partir de hoje (ou ontem se hoje ainda
 * não tem spend). Um dia sem spend = conta «caiu» → streak = 0.
 */
export function computeActiveSpendStreak(
  spendByDate: Map<string, number>,
  todayKey: string,
): number {
  let cursor = todayKey;
  if ((spendByDate.get(todayKey) ?? 0) <= 0) {
    cursor = prevDateKey(todayKey);
  }
  let streak = 0;
  for (let i = 0; i < ACTIVE_STREAK_LOOKBACK_DAYS; i++) {
    if ((spendByDate.get(cursor) ?? 0) <= 0) break;
    streak += 1;
    cursor = prevDateKey(cursor);
  }
  return streak;
}

/**
 * ROAS real por coleção: REV Shopify (membership) ÷ spend das campanhas
 * cujo URL de destino é `/collections/{handle}` — nunca a coleção principal.
 */
export async function buildCollectionRoasReport(
  workspaceId: string,
  storeId: string,
  periodInput?: PeriodInput,
  options?: { refreshLandings?: boolean },
): Promise<CollectionRoasReport> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const store = await Store.findOne({
    _id: storeId,
    workspaceId: wsId,
    deletedAt: null,
    ...NON_ARCHIVED_STORE_FILTER,
  })
    .select("name currency ianaTimezone displayUrl shopDomain")
    .lean();

  const empty: CollectionRoasReport = {
    storeName: "",
    storeDomain: "",
    adAccountLabel: "",
    periodLabel: "",
    periodFromLabel: "",
    periodToLabel: "",
    periodKey: "",
    currency: "EUR",
    collections: [],
    storeBriefingText: "",
    unmatchedCampaigns: [],
    targetsSynced: 0,
    urlsFound: 0,
    landingSyncErrors: [],
    lastLandingSyncAt: null,
  };

  if (!store) return empty;

  const storeTz = normalizeStoreTimezone(store.ianaTimezone);
  const period = resolvePeriodForStore(periodInput, storeTz);
  const from = formatDateInput(period.start);
  const to = formatDateInput(period.end);
  const dateKeys =
    period.specificDates?.length && period.specificDates.length > 0
      ? [...period.specificDates].sort()
      : dayKeysBetweenInTimezone(period.start, period.end, storeTz);

  const periodFromKey = dateKeys[0] ?? from;
  const periodToKey = dateKeys[dateKeys.length - 1] ?? to;
  const formatEnDay = (dateKey: string) => {
    const d = new Date(`${dateKey}T12:00:00`);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  const periodFromLabel = formatEnDay(periodFromKey);
  const periodToLabel = formatEnDay(periodToKey);

  const storeDomain =
    getStoreDisplayUrl(store) ?? store.name ?? "";

  const adAccounts = await loadSyncAdAccountsForStore(store._id);
  const adAccountLabel =
    adAccounts
      .map((a) => {
        const name = (a.accountName ?? "").trim();
        if (name) return name;
        return `${AD_PLATFORM_LABELS[a.platform as AdPlatform] ?? a.platform} ${a.externalAccountId}`;
      })
      .filter(Boolean)
      .join(" · ") || "—";

  const currency =
    (await Workspace.findById(wsId).select("baseCurrency").lean())
      ?.baseCurrency ??
    store.currency ??
    "EUR";
  const fmtMoney = (v: number) => formatCurrency(v, currency);

  let targetsSynced = 0;
  let urlsFound = 0;
  let landingSyncErrors: string[] = [];
  if (options?.refreshLandings === true) {
    try {
      const r = await syncAdCampaignLandingsForStore(storeId);
      targetsSynced = r.campaignsUpdated;
      urlsFound = r.urlsFound;
      landingSyncErrors = r.errors;
    } catch (e) {
      landingSyncErrors = [
        e instanceof Error ? e.message : "Falha a sincronizar URLs das ads.",
      ];
    }
  }

  const storeOid = store._id;
  const targets = await AdCampaignTarget.find({ storeId: storeOid })
    .select(
      "campaignId campaignName platform landingUrls collectionHandles productHandles syncedAt",
    )
    .lean();

  let lastLandingSyncAt: Date | null = null;
  for (const t of targets) {
    if (t.syncedAt && (!lastLandingSyncAt || t.syncedAt > lastLandingSyncAt)) {
      lastLandingSyncAt = t.syncedAt;
    }
  }

  const spendRows = await AdCampaignDay.aggregate<{
    _id: { campaignId: string; platform: string };
    spend: number;
    conversionValue: number;
    campaignName: string;
  }>([
    {
      $match: {
        storeId: storeOid,
        dateKey: { $in: dateKeys },
      },
    },
    {
      $group: {
        _id: { campaignId: "$campaignId", platform: "$platform" },
        spend: { $sum: "$spend" },
        conversionValue: { $sum: "$conversionValue" },
        campaignName: { $last: "$campaignName" },
      },
    },
  ]);

  const spendByCampaign = new Map<
    string,
    {
      spend: number;
      conversionValue: number;
      campaignName: string;
      platform: AdPlatform;
    }
  >();
  for (const r of spendRows) {
    const campaignId = normalizeCampaignId(String(r._id.campaignId));
    const platform = r._id.platform as AdPlatform;
    const key = `${platform}:${campaignId}`;
    spendByCampaign.set(key, {
      spend: r.spend,
      conversionValue: r.conversionValue,
      campaignName: r.campaignName || campaignId,
      platform,
    });
  }

  /** handle → campanhas (ainda sem streak) */
  type PendingCampaign = Omit<
    CollectionRoasCampaign,
    "activeDays" | "activeDaysLabel"
  > & { key: string };
  const campaignsByHandle = new Map<string, PendingCampaign[]>();
  const matchedCampaignKeys = new Set<string>();
  const allRelevantKeys = new Set<string>();

  for (const t of targets) {
    const platform = t.platform as AdPlatform;
    const campaignId = normalizeCampaignId(String(t.campaignId));
    const key = `${platform}:${campaignId}`;
    const spend = spendByCampaign.get(key);
    if (!spend || spend.spend <= 0) continue;

    const platformRoas =
      spend.spend > 0 ? spend.conversionValue / spend.spend : null;
    const campaign: PendingCampaign = {
      key,
      campaignId,
      campaignName: t.campaignName || spend.campaignName,
      platform,
      platformLabel: AD_PLATFORM_LABELS[platform] ?? platform,
      spend: spend.spend,
      spendFmt: fmtMoney(spend.spend),
      landingUrls: t.landingUrls ?? [],
      platformRoas,
      platformRoasFmt: fmtRoas(platformRoas),
    };

    const collectionHandles = new Set(
      extractCollectionHandlesFromUrls(t.landingUrls ?? []),
    );

    if (!collectionHandles.size) continue;

    matchedCampaignKeys.add(key);
    allRelevantKeys.add(key);
    for (const h of collectionHandles) {
      const list = campaignsByHandle.get(h) ?? [];
      list.push(campaign);
      campaignsByHandle.set(h, list);
    }
  }

  for (const [key, spend] of spendByCampaign) {
    if (matchedCampaignKeys.has(key) || spend.spend <= 0) continue;
    allRelevantKeys.add(key);
  }

  // Spend diário para streaks (lookback independente do período seleccionado)
  const todayKey = dateKeyInTimezone(new Date(), storeTz);
  const lookbackStart = formatDateInput(
    addDays(startOfDay(new Date(`${todayKey}T12:00:00`)), -(ACTIVE_STREAK_LOOKBACK_DAYS - 1)),
  );
  const dailyRows = allRelevantKeys.size
    ? await AdCampaignDay.aggregate<{
        _id: { campaignId: string; platform: string; dateKey: string };
        spend: number;
      }>([
        {
          $match: {
            storeId: storeOid,
            dateKey: { $gte: lookbackStart, $lte: todayKey },
          },
        },
        {
          $group: {
            _id: {
              campaignId: "$campaignId",
              platform: "$platform",
              dateKey: "$dateKey",
            },
            spend: { $sum: "$spend" },
          },
        },
      ])
    : [];

  const dailySpendByCampaign = new Map<string, Map<string, number>>();
  for (const r of dailyRows) {
    const campaignId = normalizeCampaignId(String(r._id.campaignId));
    const key = `${r._id.platform}:${campaignId}`;
    if (!allRelevantKeys.has(key)) continue;
    let byDate = dailySpendByCampaign.get(key);
    if (!byDate) {
      byDate = new Map();
      dailySpendByCampaign.set(key, byDate);
    }
    byDate.set(r._id.dateKey, (byDate.get(r._id.dateKey) ?? 0) + r.spend);
  }

  const campaignStreak = new Map<string, number>();
  for (const key of allRelevantKeys) {
    campaignStreak.set(
      key,
      computeActiveSpendStreak(
        dailySpendByCampaign.get(key) ?? new Map(),
        todayKey,
      ),
    );
  }

  function withStreak(c: PendingCampaign): CollectionRoasCampaign {
    const activeDays = campaignStreak.get(c.key) ?? 0;
    const { key: _k, ...rest } = c;
    return {
      ...rest,
      activeDays,
      activeDaysLabel: fmtActiveDays(activeDays),
    };
  }

  const handlesWithCampaigns = [...campaignsByHandle.keys()];
  const membershipRev = await buildCollectionMembershipRevenue(
    workspaceId,
    storeId,
    { from: periodFromKey, to: periodToKey },
    handlesWithCampaigns,
  );

  const collections: CollectionRoasRow[] = handlesWithCampaigns
    .map((handle) => {
      const campaigns = campaignsByHandle.get(handle) ?? [];
      const seen = new Set<string>();
      const uniquePending = campaigns.filter((cam) => {
        if (seen.has(cam.key)) return false;
        seen.add(cam.key);
        return true;
      });
      if (!uniquePending.length) return null;

      const uniqueCampaigns = uniquePending
        .map(withStreak)
        .sort((a, b) => b.spend - a.spend);

      // Streak da coleção: dias com spend agregado > 0
      const collectionDaily = new Map<string, number>();
      for (const cam of uniquePending) {
        const byDate = dailySpendByCampaign.get(cam.key);
        if (!byDate) continue;
        for (const [dk, spend] of byDate) {
          collectionDaily.set(dk, (collectionDaily.get(dk) ?? 0) + spend);
        }
      }
      const activeDays = computeActiveSpendStreak(collectionDaily, todayKey);

      const sales = membershipRev.get(handle);
      const revenue = sales?.revenue ?? 0;
      const units = sales?.units ?? 0;
      const adSpend = uniqueCampaigns.reduce((s, cam) => s + cam.spend, 0);
      const realRoas = adSpend > 0 ? revenue / adSpend : null;
      const realRoasFmt = fmtRoas(realRoas);
      const collectionTitle = sales?.collectionTitle ?? handle;

      const briefingText = buildCollectionBriefingMessage({
        periodFromLabel,
        periodToLabel,
        adAccount: adAccountLabel,
        storeDomain,
        campaignNames: uniqueCampaigns.map((c) => c.campaignName),
        revenueFmt: fmtMoney(revenue),
        spendFmt: fmtMoney(adSpend),
        roasFmt: realRoasFmt,
        collectionTitle,
      });

      return {
        collectionId: sales?.collectionId ?? handle,
        collectionTitle,
        handle,
        units,
        revenue,
        revenueFmt: fmtMoney(revenue),
        adSpend,
        adSpendFmt: fmtMoney(adSpend),
        realRoas,
        realRoasFmt,
        campaigns: uniqueCampaigns,
        unmatched: false,
        activeDays,
        activeDaysLabel: fmtActiveDays(activeDays),
        briefingText,
      };
    })
    .filter((row): row is CollectionRoasRow => row != null)
    .sort((a, b) => b.adSpend - a.adSpend || b.revenue - a.revenue);

  const unmatchedCampaigns: CollectionRoasCampaign[] = [];
  for (const [key, spend] of spendByCampaign) {
    if (matchedCampaignKeys.has(key) || spend.spend <= 0) continue;
    const [platform, campaignId] = key.split(":");
    const target = targets.find(
      (t) =>
        normalizeCampaignId(String(t.campaignId)) === campaignId &&
        t.platform === platform,
    );
    const platformRoas =
      spend.spend > 0 ? spend.conversionValue / spend.spend : null;
    const activeDays = campaignStreak.get(key) ?? 0;
    unmatchedCampaigns.push({
      campaignId: campaignId!,
      campaignName: target?.campaignName || spend.campaignName,
      platform: spend.platform,
      platformLabel: AD_PLATFORM_LABELS[spend.platform] ?? spend.platform,
      spend: spend.spend,
      spendFmt: fmtMoney(spend.spend),
      landingUrls: target?.landingUrls ?? [],
      platformRoas,
      platformRoasFmt: fmtRoas(platformRoas),
      activeDays,
      activeDaysLabel: fmtActiveDays(activeDays),
    });
  }
  unmatchedCampaigns.sort((a, b) => b.spend - a.spend);

  return {
    storeName: store.name,
    storeDomain,
    adAccountLabel,
    periodLabel: period.label,
    periodFromLabel,
    periodToLabel,
    periodKey: period.key,
    currency,
    collections,
    storeBriefingText: joinStoreBriefingMessages(
      collections.map((c) => c.briefingText),
    ),
    unmatchedCampaigns: unmatchedCampaigns.slice(0, 40),
    targetsSynced,
    urlsFound,
    landingSyncErrors,
    lastLandingSyncAt: lastLandingSyncAt
      ? lastLandingSyncAt.toISOString()
      : null,
  };
}
