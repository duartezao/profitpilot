/**
 * Quando uma variante não tem preço/custo na Shopify, usa outra variante do mesmo
 * produto ou o preço mínimo do produto (priceRangeV2).
 */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type CatalogSiblingNode = {
  id: string;
  price: string | number;
  inventoryItem?: { unitCost?: { amount?: string | null } | null } | null;
};

export type CatalogVariantInput = {
  id: string;
  price: string | number;
  product?: {
    id: string;
    priceRangeV2?: {
      minVariantPrice?: { amount?: string | null } | null;
    } | null;
    variants?: { nodes: CatalogSiblingNode[] } | null;
  } | null;
  inventoryItem?: { unitCost?: { amount?: string | null } | null } | null;
};

export type CatalogFallbackContext = {
  byProduct: Map<
    string,
    Array<{ variantId: string; price: number; unitCost: number }>
  >;
  productMinPrice: Map<string, number>;
};

export function buildCatalogFallbackContext(
  nodes: CatalogVariantInput[],
  existing: Array<{
    variantId: string;
    productId?: string | null;
    price?: number | null;
    unitCost?: number | null;
  }> = [],
): CatalogFallbackContext {
  const byProduct = new Map<
    string,
    Array<{ variantId: string; price: number; unitCost: number }>
  >();
  const productMinPrice = new Map<string, number>();

  const add = (
    productId: string,
    variantId: string,
    price: number,
    unitCost: number,
  ) => {
    const list = byProduct.get(productId) ?? [];
    const idx = list.findIndex((e) => e.variantId === variantId);
    const entry = { variantId, price, unitCost };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    byProduct.set(productId, list);
  };

  for (const row of existing) {
    const productId = row.productId ? String(row.productId) : "";
    if (!productId) continue;
    add(
      productId,
      String(row.variantId),
      num(row.price),
      num(row.unitCost),
    );
  }

  for (const v of nodes) {
    const productId = v.product?.id;
    if (!productId) continue;

    const minFromApi = num(
      v.product?.priceRangeV2?.minVariantPrice?.amount,
    );
    if (minFromApi > 0) {
      const prev = productMinPrice.get(productId) ?? 0;
      if (prev <= 0) productMinPrice.set(productId, minFromApi);
    }

    for (const sib of v.product?.variants?.nodes ?? []) {
      add(
        productId,
        sib.id,
        num(sib.price),
        num(sib.inventoryItem?.unitCost?.amount),
      );
    }

    add(
      productId,
      v.id,
      num(v.price),
      num(v.inventoryItem?.unitCost?.amount),
    );
  }

  return { byProduct, productMinPrice };
}

function pickSiblingValue(
  variantId: string,
  productId: string | null | undefined,
  ctx: CatalogFallbackContext,
  field: "price" | "unitCost",
): number {
  if (!productId) return 0;
  const siblings = ctx.byProduct.get(productId) ?? [];
  let best = 0;
  for (const sib of siblings) {
    if (sib.variantId === variantId) continue;
    const value = field === "price" ? sib.price : sib.unitCost;
    if (value <= 0) continue;
    if (field === "unitCost") {
      if (value > best) best = value;
    } else if (best <= 0) {
      best = value;
    }
  }
  return best;
}

/** Preço de venda: variante → outra variante → mínimo do produto. */
export function resolveVariantCatalogPrice(
  variantId: string,
  productId: string | null | undefined,
  directPrice: number,
  ctx: CatalogFallbackContext,
): number {
  if (directPrice > 0) return directPrice;
  const fromSibling = pickSiblingValue(variantId, productId, ctx, "price");
  if (fromSibling > 0) return fromSibling;
  if (productId) {
    const min = ctx.productMinPrice.get(productId) ?? 0;
    if (min > 0) return min;
  }
  return 0;
}

/** COGS: variante → outra variante do mesmo produto. */
export function resolveVariantCatalogCost(
  variantId: string,
  productId: string | null | undefined,
  directCost: number,
  ctx: CatalogFallbackContext,
): number {
  if (directCost > 0) return directCost;
  return pickSiblingValue(variantId, productId, ctx, "unitCost");
}
