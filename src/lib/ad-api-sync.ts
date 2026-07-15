import "server-only";
import type { Types } from "mongoose";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { Workspace } from "@/models/Workspace";
import {
  getTodayDateKey,
  canApiWriteAdSpendForStore,
} from "@/lib/ad-spend-lock";
import {
  dateKeyInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import {
  type AdSpendLineStored,
  type AdPlatform,
} from "@/lib/ad-spend-platforms";
import {
  buildAdSpendLineFromInput,
  summarizeAdSpendLines,
} from "@/lib/ad-spend-save";
import {
  credentialTokenForPlatform,
  decryptAdCredentials,
  googleLoginCustomerIdFromCreds,
  loadSyncAdAccountsForStore,
  markAdAccountSync,
  type AdAccountCredentials,
} from "@/lib/ad-accounts";
import { fetchMetaAdSpendForDay } from "@/lib/meta-ads";
import { fetchGoogleAdSpendForDay } from "@/lib/google-ads";
import { fetchTiktokAdSpendForDay } from "@/lib/tiktok-ads";
import { syncAdCampaignMetricsForStoreDay, syncAdCampaignMetricsForStoreDays } from "@/lib/ad-campaign-sync";
import { syncApiMetricsToDailyNote } from "@/lib/ad-note-sync";

export type ApiAdSpendSyncResult = {
  storeId: string;
  today: string;
  updated: boolean;
  campaignsSynced?: number;
  skippedReason?: "no_accounts" | "locked" | "no_data";
};

type PlatformApiSpend = {
  spend: number;
  currency: string;
  fees: { extraFeeFixed: number; agencyFeePercent: number };
};

/**
 * Substitui linhas das plataformas ligadas à API; mantém outras plataformas
 * e o histórico sem reconverter (idempotente em cada sync).
 */
async function upsertApiAdSpendForDay(
  workspaceId: Types.ObjectId,
  storeId: Types.ObjectId,
  dateKey: string,
  storeTimeZone: string | null | undefined,
  baseCurrency: string,
  apiByPlatform: Map<AdPlatform, PlatformApiSpend>,
  opts?: { forceOverwrite?: boolean },
): Promise<boolean> {
  const existing = await ManualAdSpend.findOne({ storeId, dateKey }).lean();
  if (
    !canApiWriteAdSpendForStore(dateKey, storeTimeZone, Boolean(existing), new Date(), {
      forceOverwrite: Boolean(opts?.forceOverwrite),
    })
  ) {
    return false;
  }

  const apiPlatforms = new Set(apiByPlatform.keys());

  const preserved: AdSpendLineStored[] = (existing?.lines ?? [])
    .filter((l) => !apiPlatforms.has(l.platform as AdPlatform))
    .map((l) => ({
      platform: l.platform as AdPlatform,
      inputAmount: Number(l.inputAmount ?? 0),
      inputCurrency: l.inputCurrency ?? "USD",
      amount: Number(l.amount ?? 0),
      fxRate: l.fxRate ?? null,
      extraFee: Number(l.extraFee ?? 0),
      inputExtraFee: l.inputExtraFee ?? null,
      agencyFeePercent: Number(l.agencyFeePercent ?? 0),
      agencyFeeAmount: Number(l.agencyFeeAmount ?? 0),
      inputAgencyFeeAmount: l.inputAgencyFeeAmount ?? null,
    }));

  const apiLines: AdSpendLineStored[] = [];
  for (const [platform, data] of apiByPlatform) {
    const hasValue =
      data.spend > 0 ||
      data.fees.extraFeeFixed > 0;
    if (!hasValue) continue;

    apiLines.push(
      await buildAdSpendLineFromInput(
        {
          platform,
          spend: data.spend,
          extraFeeFixed: data.fees.extraFeeFixed,
          agencyFeePercent: data.fees.agencyFeePercent,
          inputCurrency: data.currency,
        },
        data.currency,
        baseCurrency,
        dateKey,
      ),
    );
  }

  const allLines = [...preserved, ...apiLines];
  if (!allLines.length) {
    if (existing) {
      await ManualAdSpend.deleteOne({ storeId, dateKey });
    }
    return true;
  }

  const built = summarizeAdSpendLines(allLines);

  await ManualAdSpend.findOneAndUpdate(
    { storeId, dateKey },
    {
      $set: {
        workspaceId,
        storeId,
        dateKey,
        amount: built.amount,
        extraFee: built.extraFee,
        inputAmount: built.inputAmount,
        inputCurrency: built.inputCurrency === "MIXED" ? null : built.inputCurrency,
        fxRate: built.fxRate,
        inputExtraFee: built.inputExtraFee,
        lines: built.lines,
        currency: baseCurrency,
        source: "api",
        note: existing?.note ?? "",
      },
    },
    { upsert: true },
  );

  return true;
}

async function fetchSpendForAccount(
  platform: AdPlatform,
  creds: AdAccountCredentials,
  externalAccountId: string,
  dateKey: string,
): Promise<{ spend: number; currency: string }> {
  const token = credentialTokenForPlatform(platform, creds);
  switch (platform) {
    case "meta":
      return fetchMetaAdSpendForDay(token, externalAccountId, dateKey);
    case "google":
      return fetchGoogleAdSpendForDay(
        token,
        externalAccountId,
        dateKey,
        googleLoginCustomerIdFromCreds(creds),
      );
    case "tiktok":
      return fetchTiktokAdSpendForDay(token, externalAccountId, dateKey);
    default:
      throw new Error(`Plataforma ${platform} não suportada.`);
  }
}

/** Sincroniza gasto API (hoje ou dia indicado) + campanhas. */
export async function syncAdAccountsSpendForStore(
  storeId: string,
  options?: {
    campaignDateKeys?: string[];
    dateKey?: string;
    skipDailyNote?: boolean;
    /** Só campanhas — não chama API de gasto (dia passado já com ManualAdSpend). */
    skipSpendSync?: boolean;
    /** Só sincroniza campanhas destas plataformas (ex. refresh de conversões Google). */
    campaignPlatforms?: AdPlatform[];
    /** Permite reescrever dias passados (apenas se a origem actual for API). */
    forceOverwrite?: boolean;
  },
): Promise<ApiAdSpendSyncResult> {
  const { Store } = await import("@/models/Store");
  const store = await Store.findById(storeId)
    .select("workspaceId ianaTimezone")
    .lean();
  if (!store) {
    return {
      storeId,
      today: getTodayDateKey(),
      updated: false,
      skippedReason: "no_data",
    };
  }

  const workspace = await Workspace.findById(store.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = workspace?.baseCurrency ?? "EUR";
  const storeTz = normalizeStoreTimezone(store.ianaTimezone);
  const dateKey =
    options?.dateKey ?? dateKeyInTimezone(new Date(), storeTz);

  const accounts = await loadSyncAdAccountsForStore(store._id);
  if (!accounts.length) {
    return { storeId, today: dateKey, updated: false, skippedReason: "no_accounts" };
  }

  const existingSpend = await ManualAdSpend.findOne({ storeId: store._id, dateKey })
    .select("dateKey source")
    .lean();
  const existingSource = (existingSpend?.source as string | undefined) ?? null;
  const canWriteSpend =
    !options?.skipSpendSync &&
    existingSource !== "manual" &&
    canApiWriteAdSpendForStore(dateKey, storeTz, Boolean(existingSpend), new Date(), {
      forceOverwrite: Boolean(options?.forceOverwrite) && existingSource === "api",
    });

  const apiByPlatform = new Map<AdPlatform, PlatformApiSpend>();
  let anyError = false;

  if (canWriteSpend) {
    for (const acc of accounts) {
      const platform = acc.platform as AdPlatform;
      try {
        const creds = decryptAdCredentials<AdAccountCredentials>(acc.credentials);
        const { spend, currency } = await fetchSpendForAccount(
          platform,
          creds,
          acc.externalAccountId,
          dateKey,
        );
        const alloc = (acc.allocation ?? 100) / 100;
        const part = spend * alloc;
        const inputCurrency =
          platform === "google"
            ? (currency || "USD").toUpperCase()
            : currency.toUpperCase();

        apiByPlatform.set(platform, {
          spend: part,
          currency: inputCurrency,
          fees: {
            extraFeeFixed: acc.apiExtraFeeFixed ?? 0,
            agencyFeePercent: acc.apiAgencyFeePercent ?? 0,
          },
        });
        await markAdAccountSync(acc._id, true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha no sync.";
        await markAdAccountSync(acc._id, false, msg);
        anyError = true;
      }
    }
  }

  let updated = false;
  if (canWriteSpend) {
    updated = await upsertApiAdSpendForDay(
      store.workspaceId,
      store._id,
      dateKey,
      storeTz,
      baseCurrency,
      apiByPlatform,
      {
        forceOverwrite:
          Boolean(options?.forceOverwrite) && existingSource === "api",
      },
    );
  }

  if (updated) {
    const { invalidateWorkspaceMetricsCache } = await import(
      "@/lib/metrics-summary-cache"
    );
    invalidateWorkspaceMetricsCache(String(store.workspaceId));
  }

  if (!updated && !anyError && apiByPlatform.size === 0 && canWriteSpend) {
    return { storeId, today: dateKey, updated: false, skippedReason: "no_data" };
  }

  const campaignKeys = options?.campaignDateKeys?.length
    ? options.campaignDateKeys
    : [dateKey];
  const campaignOptions = options?.campaignPlatforms?.length
    ? { platforms: options.campaignPlatforms }
    : undefined;
  let campaignsSynced = 0;
  try {
    if (campaignKeys.length === 1) {
      const r = await syncAdCampaignMetricsForStoreDay(
        storeId,
        campaignKeys[0],
        campaignOptions,
      );
      campaignsSynced = r.campaignsSynced;
      if (!canWriteSpend && r.campaignsSynced > 0) {
        for (const acc of accounts) {
          await markAdAccountSync(acc._id, true);
        }
      }
    } else {
      const r = await syncAdCampaignMetricsForStoreDays(
        storeId,
        campaignKeys,
        campaignOptions,
      );
      campaignsSynced = r.campaignsSynced;
    }
  } catch {
    /* campanhas — não bloqueia spend */
  }
  try {
    if (!options?.skipDailyNote) {
      await syncApiMetricsToDailyNote(
        String(store.workspaceId),
        storeId,
        dateKeyInTimezone(new Date(), storeTz),
      );
    }
  } catch {
    /* notas — não bloqueia spend */
  }

  const didWork =
    (updated && apiByPlatform.size > 0) || campaignsSynced > 0;

  if (didWork) {
    const { invalidateWorkspaceMetricsCache } = await import(
      "@/lib/metrics-summary-cache"
    );
    const { invalidateAdCampaignsCache } = await import(
      "@/lib/ad-campaigns-cache"
    );
    invalidateWorkspaceMetricsCache(String(store.workspaceId));
    invalidateAdCampaignsCache(storeId);
  }

  return {
    storeId,
    today: dateKey,
    updated: updated && apiByPlatform.size > 0,
    campaignsSynced,
    skippedReason: didWork
      ? undefined
      : anyError
        ? "no_data"
        : canWriteSpend
          ? "locked"
          : "no_data",
  };
}
