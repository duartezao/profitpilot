export type CostResolver = (variantId: string, orderDate: Date) => number;

/**
 * Custo por linha: usa o custo válido na data da venda (histórico Shopify/manual).
 * Snapshot anterior só se ainda não há custo resolvido — permite corrigir atrasos de sync.
 */
export function applyLineUnitCost(
  variantId: string,
  orderDate: Date,
  previousSnapshot: number,
  resolveCost: CostResolver,
): number {
  if (!variantId) return 0;
  const resolved = resolveCost(variantId, orderDate);
  if (resolved > 0) return resolved;
  return previousSnapshot > 0 ? previousSnapshot : 0;
}

/**
 * Preço de venda por linha: snapshot confirmado (>0) não muda em re-sync;
 * encomendas novas usam o preço da API na altura da importação.
 */
export function applyLineUnitPrice(
  previousSnapshot: number,
  apiPrice: number,
): number {
  if (previousSnapshot > 0) return previousSnapshot;
  return apiPrice > 0 ? apiPrice : 0;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Igualdade com tolerância para decimais de moeda. */
export function pricesNearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0001;
}

/**
 * Repõe `unitPrice` das linhas a partir dos preços originais da encomenda na Shopify
 * (`originalUnitPriceSet`), por índice de linha.
 */
export function rebuildLineUnitPricesFromShopify<
  T extends { unitPrice?: number | null },
>(localLines: T[], shopifyUnitPrices: number[]): { lines: T[]; linesChanged: number } {
  let linesChanged = 0;
  const lines = localLines.map((li, index) => {
    const apiPrice = shopifyUnitPrices[index];
    if (apiPrice == null || !Number.isFinite(apiPrice)) return li;
    const prev = num(li.unitPrice);
    if (pricesNearlyEqual(prev, apiPrice)) return li;
    linesChanged++;
    return { ...li, unitPrice: apiPrice };
  });
  return { lines, linesChanged };
}
