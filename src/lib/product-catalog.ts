import type { Types } from "mongoose";
import type { AnyBulkWriteOperation } from "mongoose";
import { ProductCatalog, type ProductCatalogDoc } from "@/models/ProductCatalog";

export type ShopifyCollectionRef = {
  id: string;
  title: string;
  handle: string;
};

/** Coleções genéricas Shopify — ignoradas ao escolher a «principal». */
const GENERIC_COLLECTION_HANDLES = new Set([
  "all",
  "frontpage",
  "homepage",
  "home-page",
  "global",
]);

export function pickPrimaryCollection(
  collections: ShopifyCollectionRef[],
): ShopifyCollectionRef | null {
  for (const c of collections) {
    const handle = (c.handle ?? "").trim().toLowerCase();
    if (handle && !GENERIC_COLLECTION_HANDLES.has(handle)) {
      return c;
    }
  }
  return collections[0] ?? null;
}

export async function upsertProductCatalogEntries(
  storeId: Types.ObjectId,
  entries: Array<{
    productId: string;
    title: string;
    collections: ShopifyCollectionRef[];
  }>,
): Promise<number> {
  if (!entries.length) return 0;

  const now = new Date();
  const ops = entries.map((entry) => {
    const primary = pickPrimaryCollection(entry.collections);
    return {
      updateOne: {
        filter: { storeId, productId: entry.productId },
        update: {
          $set: {
            storeId,
            productId: entry.productId,
            title: entry.title,
            collections: entry.collections.map((c) => ({
              id: c.id,
              title: c.title,
              handle: c.handle,
            })),
            primaryCollectionId: primary?.id ?? null,
            primaryCollectionTitle: primary?.title ?? null,
            primaryCollectionHandle: primary?.handle ?? null,
            collectionsSyncedAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  await ProductCatalog.bulkWrite(
    ops as AnyBulkWriteOperation<ProductCatalogDoc>[],
    { ordered: false },
  );
  return entries.length;
}

export async function loadProductCatalogMap(
  storeId: Types.ObjectId,
  productIds?: string[],
): Promise<
  Map<
    string,
    {
      title: string;
      primaryCollectionId: string | null;
      primaryCollectionTitle: string | null;
      primaryCollectionHandle: string | null;
    }
  >
> {
  const filter: Record<string, unknown> = { storeId };
  if (productIds?.length) {
    filter.productId = { $in: productIds };
  }

  const rows = await ProductCatalog.find(filter)
    .select(
      "productId title primaryCollectionId primaryCollectionTitle primaryCollectionHandle",
    )
    .lean();

  return new Map(
    rows.map((r) => [
      String(r.productId),
      {
        title: r.title ?? "",
        primaryCollectionId: r.primaryCollectionId ?? null,
        primaryCollectionTitle: r.primaryCollectionTitle ?? null,
        primaryCollectionHandle: r.primaryCollectionHandle ?? null,
      },
    ]),
  );
}
