import { getCurrentUser } from "@/lib/auth";
import { findStoreForUser } from "@/lib/store-scope";
import {
  appliesAutoEuCustomsFees,
  buildEuCustomsFeeAutoSummary,
  purgeLegacyManualEuFeesForStore,
} from "@/lib/eu-category-fees";
import { getBaseCurrency } from "@/lib/manual-cogs";
import type { CogsMode } from "@/lib/cogs-modes";
import { EuCustomsFeeAutoPanel } from "@/components/dashboard/eu-customs-fee-auto-panel";

export async function ShopifyExtraFeesSection({
  storeId,
}: {
  storeId: string;
}) {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return null;

  const store = await findStoreForUser(
    user,
    storeId,
    "name cogsMode workspaceId ianaTimezone importStartDate createdAt analyticsSessionCountry",
    { activeOnly: true },
  );
  if (!store) return null;

  const mode = (store.cogsMode ?? "shopify") as CogsMode;
  if (!appliesAutoEuCustomsFees(mode)) return null;

  await purgeLegacyManualEuFeesForStore(store._id);

  const baseCurrency = await getBaseCurrency(store.workspaceId);
  const summary = await buildEuCustomsFeeAutoSummary(store, baseCurrency);

  return <EuCustomsFeeAutoPanel storeId={storeId} summary={summary} />;
}
