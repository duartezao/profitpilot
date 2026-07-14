import "server-only";
import { connectToDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Store } from "@/models/Store";
import { Workspace } from "@/models/Workspace";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import { canAccessStore } from "@/lib/store-access";
import {
  buildAdSpendCalendar,
  buildStoreAdSpendSummaries,
  countMissingDays,
  resolveAdSpendRange,
  type AdSpendDayRow,
  type StoreAdSpendSummary,
} from "@/lib/ad-spend";
import { parseDateInput } from "@/lib/period";
import {
  listWorkspaceGoogleLogins,
  type WorkspaceGoogleLogin,
} from "@/lib/ad-platform-credentials";
import {
  listAdAccountsForStore,
  type AdAccountRow,
} from "@/lib/ad-accounts";
import { isStoreAdApiQuotaPaused } from "@/lib/ad-api-quota";
import { googleAdsServerConfigStatus } from "@/lib/google-ads";
import { resolveLastSyncedAtForStoreIds } from "@/lib/last-sync-at";
import {
  dateKeyInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";

export type { WorkspaceGoogleLogin };

export type AdSpendStoreView = {
  storeId: string;
  storeName: string;
  baseCurrency: string;
  canEdit: boolean;
  rangeLabel: string;
  minDate: string;
  yesterday: string;
  today: string;
  calendar: AdSpendDayRow[];
  missingCount: number;
  yesterdayMissing: boolean;
  adAccounts: AdAccountRow[];
  workspaceGoogleLogins: WorkspaceGoogleLogin[];
  googleAdsApiReady: boolean;
  /** Sync automático API pausado (quota) — usar botão «Actualizar». */
  adApiQuotaPaused: boolean;
};

export type AdSpendOverviewView = {
  summaries: StoreAdSpendSummary[];
};

export type AdSpendView =
  | { mode: "overview"; overview: AdSpendOverviewView; lastSyncedAt: string | null }
  | { mode: "store"; store: AdSpendStoreView; lastSyncedAt: string | null };

export async function buildAdSpendView(storeId?: string): Promise<AdSpendView | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  await connectToDatabase();

  const stores = await Store.find(activeStoreQueryForUser(user))
    .select("name currency importStartDate createdAt ianaTimezone")
    .sort({ name: 1 })
    .lean();

  const [workspace, lastSyncedAll] = await Promise.all([
    Workspace.findById(user.workspaceId).select("baseCurrency").lean(),
    resolveLastSyncedAtForStoreIds(stores.map((s) => String(s._id))),
  ]);
  const baseCurrency = workspace?.baseCurrency ?? "EUR";
  const canEdit = ["owner", "admin", "editor"].includes(user.role);

  if (storeId) {
    if (!canAccessStore(user.storeAccess, storeId)) return null;
    const scoped = stores.find((s) => String(s._id) === storeId);
    if (!scoped) return null;

    const range = resolveAdSpendRange(scoped.importStartDate, scoped.createdAt);
    const rangeLabel = `${parseDateInput(range.fromKey)?.toLocaleDateString("pt-PT") ?? range.fromKey} – ${parseDateInput(range.toKey)?.toLocaleDateString("pt-PT") ?? range.toKey}`;

    const [calendar, adAccounts, workspaceGoogleLogins, lastSyncedAt] =
      await Promise.all([
        buildAdSpendCalendar(
          scoped._id,
          baseCurrency,
          scoped.importStartDate,
          scoped.createdAt,
        ),
        listAdAccountsForStore(user.workspaceId, String(scoped._id)),
        listWorkspaceGoogleLogins(user.workspaceId),
        resolveLastSyncedAtForStoreIds([String(scoped._id)]),
      ]);
    const missingDays = calendar.filter((d) => d.amount === null);
    const googleAdsApiReady = googleAdsServerConfigStatus().apiReady;

    const yesterday = range.toKey;
    const today = dateKeyInTimezone(
      new Date(),
      normalizeStoreTimezone(scoped.ianaTimezone),
    );

    return {
      mode: "store",
      lastSyncedAt,
      store: {
        storeId: String(scoped._id),
        storeName: scoped.name,
        baseCurrency,
        canEdit,
        rangeLabel,
        minDate: range.fromKey,
        yesterday,
        today,
        calendar,
        missingCount: countMissingDays(calendar),
        yesterdayMissing: missingDays.some((d) => d.isYesterday),
        adAccounts,
        workspaceGoogleLogins,
        googleAdsApiReady,
        adApiQuotaPaused: isStoreAdApiQuotaPaused(adAccounts),
      },
    };
  }

  const summaries = stores.length > 0
    ? await buildStoreAdSpendSummaries(stores, baseCurrency)
    : [];
  return {
    mode: "overview",
    lastSyncedAt: lastSyncedAll,
    overview: { summaries },
  };
}
