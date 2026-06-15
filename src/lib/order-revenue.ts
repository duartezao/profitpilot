/**
 * Vendas líquidas (Shopify «Net sales»): subtotal após descontos − reembolsos.
 * Não inclui envio, IVA nem taxas — alinhado com o relatório diário REV.
 */
export function orderNetRevenue(o: {
  subtotal?: number | null;
  totalPrice?: number | null;
  refunded?: number | null;
}): number {
  const refunded = o.refunded ?? 0;
  const subtotal = o.subtotal ?? 0;
  if (subtotal > 0) {
    return Math.max(0, subtotal - refunded);
  }
  // Encomendas antigas sem subtotal: aproximação pelo total − reembolsos.
  return Math.max(0, (o.totalPrice ?? 0) - refunded);
}

/** Expressão MongoDB para somar vendas líquidas num $group. */
export const netRevenueSumExpr = {
  $sum: {
    $max: [
      0,
      {
        $subtract: [
          {
            $cond: {
              if: { $gt: [{ $ifNull: ["$subtotal", 0] }, 0] },
              then: { $ifNull: ["$subtotal", 0] },
              else: { $ifNull: ["$totalPrice", 0] },
            },
          },
          { $ifNull: ["$refunded", 0] },
        ],
      },
    ],
  },
} as const;
