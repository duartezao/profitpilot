import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { canAccessStore } from "@/lib/store-access";
import {
  appliesEuCategoryFees,
  listRecentEuCategoryFees,
} from "@/lib/eu-category-fees";
import { getBaseCurrency } from "@/lib/manual-cogs";
import type { CogsMode } from "@/lib/cogs-modes";
import { ShopifyExtraFeesPanel } from "@/components/dashboard/shopify-extra-fees-panel";

const ROLES_EDIT = ["owner", "admin", "editor"] as const;

export async function ShopifyExtraFeesSection({
  storeId,
}: {
  storeId: string;
}) {
  const user = await getCurrentUser();
  if (!user || !canAccessStore(user.storeAccess, storeId)) return null;

  await connectToDatabase();
  const store = await Store.findById(storeId)
    .select("name cogsMode cogsInputCurrency workspaceId")
    .lean();
  if (!store) return null;

  const mode = (store.cogsMode ?? "shopify") as CogsMode;
  if (!appliesEuCategoryFees(mode)) return null;

  const baseCurrency = await getBaseCurrency(store.workspaceId);
  const entries = await listRecentEuCategoryFees(store._id, baseCurrency);
  const canEdit = ROLES_EDIT.includes(user.role as (typeof ROLES_EDIT)[number]);

  return (
    <ShopifyExtraFeesPanel
      storeId={storeId}
      storeName={store.name}
      baseCurrency={baseCurrency}
      inputCurrency={store.cogsInputCurrency ?? "EUR"}
      entries={entries}
      canEdit={canEdit}
    />
  );
}
