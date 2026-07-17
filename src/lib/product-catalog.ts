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
    handle?: string | null;
    collections: ShopifyCollectionRef[];
  }>,
): Promise<number> {
  if (!entries.length) return 0;

  const now = new Date();
  const ops = entries.map((entry) => {
    const primary = pickPrimaryCollection(entry.collections);
    const handle = entry.handle?.trim()
      ? entry.handle.trim().toLowerCase()
      : null;
    return {
      updateOne: {
        filter: { storeId, productId: entry.productId },
        update: {
          $set: {
            storeId,
            productId: entry.productId,
            title: entry.title,
            handle,
            collections: entry.collections.map((c) => ({
              id: c.id,
              title: c.title,
              handle: (c.handle ?? "").trim().toLowerCase(),
            })),
            primaryCollectionId: primary?.id ?? null,
            primaryCollectionTitle: primary?.title ?? null,
            primaryCollectionHandle: primary?.handle?.trim()
              ? primary.handle.trim().toLowerCase()
              : null,
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

/** Mapa handle produto → coleção principal (para cruzar URLs /products/…). */
export async function loadProductHandleToCollectionMap(
  storeId: Types.ObjectId,
  productHandles?: string[],
): Promise<Map<string, string>> {
  const filter: Record<string, unknown> = {
    storeId,
    handle: { $exists: true, $nin: [null, ""] },
    primaryCollectionHandle: { $exists: true, $nin: [null, ""] },
  };
  if (productHandles?.length) {
    filter.handle = { $in: productHandles.map((h) => h.toLowerCase()) };
  }

  const rows = await ProductCatalog.find(filter)
    .select("handle primaryCollectionHandle")
    .lean();

  const map = new Map<string, string>();
  for (const r of rows) {
    const h = (r.handle ?? "").trim().toLowerCase();
    const col = (r.primaryCollectionHandle ?? "").trim().toLowerCase();
    if (h && col) map.set(h, col);
  }
  return map;
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
      collections: ShopifyCollectionRef[];
    }
  >
> {
  const filter: Record<string, unknown> = { storeId };
  if (productIds?.length) {
    filter.productId = { $in: productIds };
  }

  const rows = await ProductCatalog.find(filter)
    .select(
      "productId title primaryCollectionId primaryCollectionTitle primaryCollectionHandle collections",
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
        collections: (r.collections ?? []).map((c) => ({
          id: String(c.id ?? ""),
          title: c.title ?? "",
          handle: (c.handle ?? "").trim().toLowerCase(),
        })),
      },
    ]),
  );
}

/**
 * Mapa handle produto → todos os handles de coleção (membership Shopify).
 * Usado para URLs /products/… cruzarem com qualquer coleção do produto.
 */
export async function loadProductHandleToCollectionHandlesMap(
  storeId: Types.ObjectId,
  productHandles?: string[],
): Promise<Map<string, string[]>> {
  const filter: Record<string, unknown> = {
    storeId,
    handle: { $exists: true, $nin: [null, ""] },
  };
  if (productHandles?.length) {
    filter.handle = { $in: productHandles.map((h) => h.toLowerCase()) };
  }

  const rows = await ProductCatalog.find(filter)
    .select("handle collections.handle primaryCollectionHandle")
    .lean();

  const map = new Map<string, string[]>();
  for (const r of rows) {
    const h = (r.handle ?? "").trim().toLowerCase();
    if (!h) continue;
    const set = new Set<string>();
    for (const c of r.collections ?? []) {
      const ch = (c.handle ?? "").trim().toLowerCase();
      if (ch && !GENERIC_COLLECTION_HANDLES.has(ch)) set.add(ch);
    }
    const prim = (r.primaryCollectionHandle ?? "").trim().toLowerCase();
    if (prim && !GENERIC_COLLECTION_HANDLES.has(prim)) set.add(prim);
    map.set(h, [...set]);
  }
  return map;
}
