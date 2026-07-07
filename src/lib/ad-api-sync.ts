import "server-only";
import type { Types } from "mongoose";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { Workspace } from "@/models/Workspace";
import {
  getTodayDateKey,
  isAdSpendDayLockedForApiForStore,
  isAdSpendTodayOpenForStore,
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
  loadActiveAdAccounts,
  markAdAccountSync,
  type AdAccountCredentials,
} from "@/lib/ad-accounts";
import { fetchMetaAdSpendForDay } from "@/lib/meta-ads";
import { fetchGoogleAdSpendForDay } from "@/lib/google-ads";
import { fetchTiktokAdSpendForDay } from "@/lib/tiktok-ads";
import { syncAdCampaignMetricsForStoreDay } from "@/lib/ad-campaign-sync";
import { syncApiMetricsToDailyNote } from "@/lib/ad-note-sync";

export type ApiAdSpendSyncResult = {
  storeId: string;
  today: string;
  updated: boolean;
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
): Promise<boolean> {
  if (
    isAdSpendDayLockedForApiForStore(dateKey, storeTimeZone) ||
    !isAdSpendTodayOpenForStore(dateKey, storeTimeZone)
  ) {
    return false;
  }

  const apiPlatforms = new Set(apiByPlatform.keys());
  const existing = await ManualAdSpend.findOne({ storeId, dateKey }).lean();

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
      data.fees.extraFeeFixed > 0 ||
      data.fees.agencyFeePercent > 0;
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
      return fetchGoogleAdSpendForDay(token, externalAccountId, dateKey);
    case "tiktok":
      return fetchTiktokAdSpendForDay(token, externalAccountId, dateKey);
    default:
      throw new Error(`Plataforma ${platform} não suportada.`);
  }
}

/** Sincroniza gasto de hoje a partir das contas de ads ligadas. */
export async function syncAdAccountsSpendForStore(
  storeId: string,
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
  const today = dateKeyInTimezone(new Date(), storeTz);

  const accounts = await loadActiveAdAccounts(store._id);
  if (!accounts.length) {
    return { storeId, today, updated: false, skippedReason: "no_accounts" };
  }

  /** Uma conta activa por plataforma (evita somar a mesma spend duas vezes). */
  const accountByPlatform = new Map<AdPlatform, (typeof accounts)[number]>();
  for (const acc of accounts) {
    const platform = acc.platform as AdPlatform;
    if (!accountByPlatform.has(platform)) {
      accountByPlatform.set(platform, acc);
    }
  }

  const apiByPlatform = new Map<AdPlatform, PlatformApiSpend>();
  let anyError = false;

  for (const acc of accountByPlatform.values()) {
    const platform = acc.platform as AdPlatform;
    try {
      const creds = decryptAdCredentials<AdAccountCredentials>(acc.credentials);
      const { spend, currency } = await fetchSpendForAccount(
        platform,
        creds,
        acc.externalAccountId,
        today,
      );
      const alloc = (acc.allocation ?? 100) / 100;
      const part = spend * alloc;
      const inputCurrency =
        platform === "google" ? (currency || "USD").toUpperCase() : currency.toUpperCase();

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

  const updated = await upsertApiAdSpendForDay(
    store.workspaceId,
    store._id,
    today,
    storeTz,
    baseCurrency,
    apiByPlatform,
  );

  if (!updated && !anyError && apiByPlatform.size === 0) {
    return { storeId, today, updated: false, skippedReason: "no_data" };
  }

  try {
    await syncAdCampaignMetricsForStoreDay(storeId, today);
    await syncApiMetricsToDailyNote(
      String(store.workspaceId),
      storeId,
      today,
    );
  } catch {
    /* campanhas/notas — não bloqueia spend */
  }

  return {
    storeId,
    today,
    updated: updated && apiByPlatform.size > 0,
    skippedReason: updated ? undefined : anyError ? "no_data" : "locked",
  };
}
