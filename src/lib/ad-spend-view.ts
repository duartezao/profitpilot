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
import { googleAdsServerConfigStatus } from "@/lib/google-ads";

export type { WorkspaceGoogleLogin };

export type AdSpendStoreView = {
  storeId: string;
  storeName: string;
  baseCurrency: string;
  canEdit: boolean;
  rangeLabel: string;
  minDate: string;
  yesterday: string;
  calendar: AdSpendDayRow[];
  missingCount: number;
  yesterdayMissing: boolean;
  adAccounts: AdAccountRow[];
  workspaceGoogleLogins: WorkspaceGoogleLogin[];
  googleAdsApiReady: boolean;
};

export type AdSpendOverviewView = {
  summaries: StoreAdSpendSummary[];
};

export type AdSpendView =
  | { mode: "overview"; overview: AdSpendOverviewView }
  | { mode: "store"; store: AdSpendStoreView };

export async function buildAdSpendView(storeId?: string): Promise<AdSpendView | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  await connectToDatabase();

  const stores = await Store.find(activeStoreQueryForUser(user))
    .select("name currency importStartDate createdAt")
    .sort({ name: 1 })
    .lean();

  const workspace = await Workspace.findById(user.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = workspace?.baseCurrency ?? "EUR";
  const canEdit = ["owner", "admin", "editor"].includes(user.role);

  if (storeId) {
    if (!canAccessStore(user.storeAccess, storeId)) return null;
    const scoped = stores.find((s) => String(s._id) === storeId);
    if (!scoped) return null;

    const range = resolveAdSpendRange(scoped.importStartDate, scoped.createdAt);
    const rangeLabel = `${parseDateInput(range.fromKey)?.toLocaleDateString("pt-PT") ?? range.fromKey} – ${parseDateInput(range.toKey)?.toLocaleDateString("pt-PT") ?? range.toKey}`;

    const calendar = await buildAdSpendCalendar(
      scoped._id,
      baseCurrency,
      scoped.importStartDate,
      scoped.createdAt,
    );
    const missingDays = calendar.filter((d) => d.amount === null);
    const adAccounts = await listAdAccountsForStore(
      user.workspaceId,
      String(scoped._id),
    );
    const workspaceGoogleLogins = await listWorkspaceGoogleLogins(
      user.workspaceId,
    );
    const googleAdsApiReady = googleAdsServerConfigStatus().apiReady;

    const yesterday = range.toKey;

    return {
      mode: "store",
      store: {
        storeId: String(scoped._id),
        storeName: scoped.name,
        baseCurrency,
        canEdit,
        rangeLabel,
        minDate: range.fromKey,
        yesterday,
        calendar,
        missingCount: countMissingDays(calendar),
        yesterdayMissing: missingDays.some((d) => d.isYesterday),
        adAccounts,
        workspaceGoogleLogins,
        googleAdsApiReady,
      },
    };
  }

  const summaries =
    stores.length > 0
      ? await buildStoreAdSpendSummaries(stores, baseCurrency)
      : [];
  return { mode: "overview", overview: { summaries } };
}
