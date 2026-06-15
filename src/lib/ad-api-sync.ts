import "server-only";
import type { Types } from "mongoose";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { Workspace } from "@/models/Workspace";
import {
  getTodayDateKey,
  isAdSpendDayLockedForApi,
  isAdSpendTodayOpen,
} from "@/lib/ad-spend-lock";
import {
  dateKeyInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import {
  type AdSpendLineInput,
  type AdPlatform,
} from "@/lib/ad-spend-platforms";
import { buildAdSpendDayFromLines } from "@/lib/ad-spend-save";
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

export type ApiAdSpendSyncResult = {
  storeId: string;
  today: string;
  updated: boolean;
  skippedReason?: "no_accounts" | "locked" | "no_data";
};

async function mergePlatformSpendFromApi(
  workspaceId: Types.ObjectId,
  storeId: Types.ObjectId,
  dateKey: string,
  platform: AdPlatform,
  spendInput: number,
  inputCurrency: string,
  baseCurrency: string,
): Promise<boolean> {
  if (isAdSpendDayLockedForApi(dateKey) || !isAdSpendTodayOpen(dateKey)) {
    return false;
  }

  const existing = await ManualAdSpend.findOne({ storeId, dateKey }).lean();
  const otherLines = (existing?.lines ?? []).filter(
    (l) => l.platform !== platform,
  );

  const inputs: AdSpendLineInput[] = otherLines.map((l) => ({
    platform: l.platform as AdPlatform,
    spend: l.inputAmount ?? l.amount,
    extraFeeFixed: l.inputExtraFee ?? 0,
    agencyFeePercent: l.agencyFeePercent ?? 0,
  }));

  if (spendInput > 0) {
    inputs.push({
      platform,
      spend: spendInput,
      extraFeeFixed: 0,
      agencyFeePercent: 0,
    });
  }

  if (!inputs.length) {
    await ManualAdSpend.deleteOne({ storeId, dateKey });
    return true;
  }

  const built = await buildAdSpendDayFromLines(
    inputs,
    inputCurrency,
    baseCurrency,
    dateKey,
  );

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
        inputCurrency: built.inputCurrency,
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

  const spendByPlatform = new Map<
    AdPlatform,
    { spend: number; currency: string }
  >();
  let anyError = false;

  for (const acc of accounts) {
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
      const prev = spendByPlatform.get(platform);
      spendByPlatform.set(platform, {
        spend: (prev?.spend ?? 0) + part,
        currency: prev?.currency ?? currency,
      });
      await markAdAccountSync(acc._id, true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no sync.";
      await markAdAccountSync(acc._id, false, msg);
      anyError = true;
    }
  }

  let updated = false;
  for (const [platform, { spend, currency }] of spendByPlatform) {
    const ok = await mergePlatformSpendFromApi(
      store.workspaceId,
      store._id,
      today,
      platform,
      spend,
      currency,
      baseCurrency,
    );
    if (ok && spend > 0) updated = true;
  }

  if (!updated && !anyError && spendByPlatform.size === 0) {
    return { storeId, today, updated: false, skippedReason: "no_data" };
  }

  return {
    storeId,
    today,
    updated,
    skippedReason: updated ? undefined : anyError ? "no_data" : "no_data",
  };
}
