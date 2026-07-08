import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import {
  credentialTokenForPlatform,
  decryptAdCredentials,
  googleLoginCustomerIdFromCreds,
  loadSyncAdAccountsForStore,
  type AdAccountCredentials,
} from "@/lib/ad-accounts";
import { AD_PLATFORM_LABELS, type AdPlatform } from "@/lib/ad-spend-platforms";
import {
  aggregateCampaignPeriodTotals,
  metricsFromCampaignTotals,
  roasFromCampaign,
  type LiveCampaignRow,
  type StoreCampaignsView,
} from "@/lib/ad-campaign-types";
import { loadStoreCampaignsFromDb } from "@/lib/ad-campaign-metrics";
import { fetchMetaLiveCampaigns } from "@/lib/meta-ads";
import {
  fetchGoogleLiveCampaigns,
  googleAdsServerConfigStatus,
} from "@/lib/google-ads";
import { fetchTiktokLiveCampaigns } from "@/lib/tiktok-ads";
import {
  dateKeyInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import {
  dateKeysFromResolvedPeriod,
  type PeriodInput,
} from "@/lib/period";
import { resolvePeriodForStore } from "@/lib/ad-campaign-period";

async function fetchLiveForAccount(
  platform: AdPlatform,
  creds: AdAccountCredentials,
  externalAccountId: string,
  dateKey: string,
  adAccountId: string,
  adAccountName: string,
  allocationPct: number,
): Promise<LiveCampaignRow[]> {
  if (platform === "google" && !googleAdsServerConfigStatus().apiReady) {
    throw new Error(
      "Google Ads API indisponível — confirma GOOGLE_ADS_DEVELOPER_TOKEN.",
    );
  }

  const token = credentialTokenForPlatform(platform, creds);
  let rows: LiveCampaignRow[] = [];

  switch (platform) {
    case "meta":
      rows = await fetchMetaLiveCampaigns(token, externalAccountId, dateKey);
      break;
    case "google":
      rows = await fetchGoogleLiveCampaigns(
        token,
        externalAccountId,
        dateKey,
        googleLoginCustomerIdFromCreds(creds),
      );
      break;
    case "tiktok":
      rows = await fetchTiktokLiveCampaigns(token, externalAccountId, dateKey);
      break;
    default:
      return [];
  }

  const alloc = allocationPct / 100;
  return rows.map((r) => {
    const spend = r.spend * alloc;
    const impressions = Math.round(r.impressions * alloc);
    const clicks = Math.round(r.clicks * alloc);
    const conversions = r.conversions * alloc;
    const conversionValue = r.conversionValue * alloc;
    return {
      ...r,
      platform,
      platformLabel: AD_PLATFORM_LABELS[platform] ?? platform,
      adAccountId,
      adAccountName,
      spend,
      spendPlatform: r.spendPlatform != null ? r.spendPlatform * alloc : undefined,
      impressions,
      clicks,
      conversions,
      conversionValue,
      roas: roasFromCampaign(spend, conversionValue),
      ...metricsFromCampaignTotals(spend, impressions, clicks),
    };
  });
}

async function fetchLiveCampaignsForToday(
  accounts: Awaited<ReturnType<typeof loadSyncAdAccountsForStore>>,
  todayKey: string,
): Promise<{ campaigns: LiveCampaignRow[]; errors: string[] }> {
  const campaigns: LiveCampaignRow[] = [];
  const errors: string[] = [];

  for (const acc of accounts) {
    const platform = acc.platform as AdPlatform;
    const accountId = String(acc._id);
    const accountName =
      acc.accountName?.trim() || acc.externalAccountId || platform;
    try {
      const creds = decryptAdCredentials<AdAccountCredentials>(acc.credentials);
      const rows = await fetchLiveForAccount(
        platform,
        creds,
        acc.externalAccountId,
        todayKey,
        accountId,
        accountName,
        acc.allocation ?? 100,
      );
      campaigns.push(...rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao carregar campanhas.";
      errors.push(`${AD_PLATFORM_LABELS[platform] ?? platform}: ${msg}`);
    }
  }

  campaigns.sort((a, b) => b.spend - a.spend);
  return { campaigns, errors };
}

export async function loadStoreCampaignsLive(
  storeId: string,
  options?: { syncFirst?: boolean; periodInput?: PeriodInput },
): Promise<StoreCampaignsView> {
  await connectToDatabase();

  const emptyBase = {
    storeId,
    periodKey: "",
    dateKey: "",
    dateFrom: "",
    dateTo: "",
    dateLabel: "",
    daysInPeriod: 0,
    daysWithData: 0,
    displayCurrency: "EUR",
    fxDateKey: "",
    hasLinkedAccounts: false,
    includesToday: false,
    source: "cache" as const,
    syncedAt: null,
    campaigns: [] as StoreCampaignsView["campaigns"],
    totals: aggregateCampaignPeriodTotals([], "EUR"),
    errors: [] as string[],
  };

  if (!mongoose.isValidObjectId(storeId)) {
    return { ...emptyBase, errors: ["Loja inválida."] };
  }

  const store = await Store.findById(storeId)
    .select("name ianaTimezone workspaceId importStartDate createdAt")
    .lean();
  if (!store) {
    return { ...emptyBase, errors: ["Loja não encontrada."] };
  }

  const workspace = await Workspace.findById(store.workspaceId)
    .select("baseCurrency")
    .lean();
  const displayCurrency = workspace?.baseCurrency ?? "EUR";

  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const todayKey = dateKeyInTimezone(new Date(), tz);
  const resolved = resolvePeriodForStore(options?.periodInput ?? {}, tz);
  let dateKeys = dateKeysFromResolvedPeriod(resolved);
  dateKeys = dateKeys.filter((k) => k <= todayKey);

  const importFloor = store.importStartDate
    ? dateKeyInTimezone(new Date(store.importStartDate), tz)
    : store.createdAt
      ? dateKeyInTimezone(new Date(store.createdAt), tz)
      : null;
  if (importFloor) {
    dateKeys = dateKeys.filter((k) => k >= importFloor);
  }

  const dateFrom = dateKeys[0] ?? todayKey;
  const dateTo = dateKeys[dateKeys.length - 1] ?? todayKey;
  const dateLabel = resolved.label;
  const includesToday = dateKeys.includes(todayKey);

  let accounts = await loadSyncAdAccountsForStore(store._id);
  if (!accounts.length) {
    return {
      ...emptyBase,
      periodKey: resolved.key,
      dateKey: todayKey,
      dateFrom,
      dateTo,
      dateLabel,
      daysInPeriod: dateKeys.length,
      displayCurrency,
      fxDateKey: todayKey,
      includesToday,
    };
  }

  const errors: string[] = [];
  let source: StoreCampaignsView["source"] = "cache";

  // Sync manual explícito:
  // - Se o período inclui hoje, sincroniza hoje.
  // - Caso contrário, sincroniza o último dia do período (ex.: ontem) e permite reescrever spend API
  //   para corrigir dias incompletos (sem tocar em dias manuais).
  if (options?.syncFirst) {
    const { syncAdAccountsSpendForStore } = await import("@/lib/ad-api-sync");
    const targetKey = includesToday ? todayKey : dateTo;
    try {
      await syncAdAccountsSpendForStore(storeId, {
        dateKey: targetKey,
        campaignDateKeys: [targetKey],
        forceOverwrite: !includesToday,
      });
      source = "live";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no sync.";
      errors.push(msg);
    }

    accounts = await loadSyncAdAccountsForStore(store._id);

    for (const acc of accounts) {
      if (acc.lastSyncError) {
        const platform = acc.platform as AdPlatform;
        errors.push(
          `${AD_PLATFORM_LABELS[platform] ?? platform}: ${acc.lastSyncError}`,
        );
      }
    }
  }

  const accountRows = accounts.map((a) => ({
    id: String(a._id),
    platform: a.platform as AdPlatform,
    accountName: a.accountName?.trim() || a.externalAccountId || "",
    externalAccountId: a.externalAccountId,
    apiExtraFeeFixed: a.apiExtraFeeFixed ?? 0,
    apiAgencyFeePercent: a.apiAgencyFeePercent ?? 0,
  }));

  const { campaigns, syncedAt, daysWithData } = await loadStoreCampaignsFromDb(
    storeId,
    dateKeys,
    accountRows,
    { baseCurrency: displayCurrency, fxDateKey: todayKey },
  );

  let finalCampaigns = campaigns;
  let finalSource = source;
  const finalErrors = [...errors];

  // Fallback live: BD vazia após sync (ex. primeiro sync ou API sem dados persistidos).
  if (options?.syncFirst && includesToday && campaigns.length === 0) {
    const live = await fetchLiveCampaignsForToday(accounts, todayKey);
    if (live.campaigns.length) {
      finalCampaigns = live.campaigns;
      finalSource = "live";
    }
    finalErrors.push(...live.errors);
  }

  return {
    storeId,
    periodKey: resolved.key,
    dateKey: todayKey,
    dateFrom,
    dateTo,
    dateLabel,
    daysInPeriod: dateKeys.length,
    daysWithData,
    displayCurrency,
    fxDateKey: todayKey,
    hasLinkedAccounts: true,
    includesToday,
    source: finalSource,
    syncedAt:
      syncedAt ??
      accounts.find((a) => a.lastSyncAt)?.lastSyncAt?.toISOString() ??
      null,
    campaigns: finalCampaigns,
    totals: aggregateCampaignPeriodTotals(finalCampaigns, displayCurrency),
    errors: [...new Set(finalErrors)],
  };
}
