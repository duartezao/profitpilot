import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { canAccessStore } from "@/lib/store-access";
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
  if (!user || !canAccessStore(user.storeAccess, storeId)) return null;

  await connectToDatabase();
  const store = await Store.findById(storeId)
    .select("name cogsMode workspaceId ianaTimezone importStartDate createdAt analyticsSessionCountry")
    .lean();
  if (!store) return null;

  const mode = (store.cogsMode ?? "shopify") as CogsMode;
  if (!appliesAutoEuCustomsFees(mode)) return null;

  await purgeLegacyManualEuFeesForStore(store._id);

  const baseCurrency = await getBaseCurrency(store.workspaceId);
  const summary = await buildEuCustomsFeeAutoSummary(store, baseCurrency);

  return (
    <EuCustomsFeeAutoPanel storeId={storeId} summary={summary} />
  );
}
