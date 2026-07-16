/**
 * Vendas líquidas (Shopify «Net sales»): subtotal após descontos − reembolsos.
 * Não inclui envio, IVA nem taxas — alinhado com o relatório diário REV.
 *
 * Nota: após edições de encomenda na Shopify, o subtotal «original» pode ficar
 * acima do total actual sem reembolso. Nesse caso usamos o total actual.
 */
export function orderNetRevenue(o: {
  subtotal?: number | null;
  totalPrice?: number | null;
  refunded?: number | null;
}): number {
  const refunded = o.refunded ?? 0;
  let subtotal = o.subtotal ?? 0;
  const totalPrice = o.totalPrice ?? 0;
  if (
    subtotal > 0 &&
    totalPrice > 0 &&
    subtotal > totalPrice + 0.009 &&
    refunded < 0.009
  ) {
    subtotal = totalPrice;
  }
  if (subtotal > 0) {
    return Math.max(0, subtotal - refunded);
  }
  // Encomendas antigas sem subtotal: aproximação pelo total − reembolsos.
  return Math.max(0, totalPrice - refunded);
}

/** Expressão MongoDB para somar vendas líquidas num $group. */
export const netRevenueSumExpr = {
  $sum: {
    $max: [
      0,
      {
        $subtract: [
          {
            $let: {
              vars: {
                sub: { $ifNull: ["$subtotal", 0] },
                tot: { $ifNull: ["$totalPrice", 0] },
                ref: { $ifNull: ["$refunded", 0] },
              },
              in: {
                $cond: {
                  if: {
                    $and: [
                      { $gt: ["$$sub", 0] },
                      { $gt: ["$$tot", 0] },
                      { $gt: ["$$sub", { $add: ["$$tot", 0.009] }] },
                      { $lt: ["$$ref", 0.009] },
                    ],
                  },
                  then: "$$tot",
                  else: {
                    $cond: {
                      if: { $gt: ["$$sub", 0] },
                      then: "$$sub",
                      else: "$$tot",
                    },
                  },
                },
              },
            },
          },
          { $ifNull: ["$refunded", 0] },
        ],
      },
    ],
  },
} as const;
