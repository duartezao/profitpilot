/** Encomendas já processadas/enviadas — contam para taxa alfandegária UE. */
export const EU_CUSTOMS_FULFILLMENT_STATUSES = [
  "fulfilled",
  "partially_fulfilled",
] as const;

const EU_CUSTOMS_FULFILLMENT_SET = new Set<string>(
  EU_CUSTOMS_FULFILLMENT_STATUSES,
);

export const FULFILLED_ORDER_STATUS_REGEX =
  /^(fulfilled|partially_fulfilled)$/i;

export function normalizeOrderFulfillmentStatus(
  status?: string | null,
): string {
  return (status ?? "").trim().toLowerCase();
}

/** Só encomendas processadas (enviadas) — pendentes podem ser canceladas. */
export function orderCountsTowardEuCustomsFee(
  fulfillmentStatus?: string | null,
): boolean {
  return EU_CUSTOMS_FULFILLMENT_SET.has(
    normalizeOrderFulfillmentStatus(fulfillmentStatus),
  );
}

/**
 * COGS de produto / taxa UE (3 €): no dia conta logo (report ao coach).
 * No sync, se a encomenda foi cancelada/reembolsada sem ter sido enviada,
 * o custo é revertido (COGS zerado; a taxa UE deixa de contar nessa encomenda).
 */
export function shouldRevertUnshippedProductCogs(input: {
  fulfillmentStatus?: string | null;
  financialStatus?: string | null;
  cancelledAt?: string | Date | null;
}): boolean {
  if (orderCountsTowardEuCustomsFee(input.fulfillmentStatus)) {
    return false;
  }
  if (input.cancelledAt) return true;
  const fin = (input.financialStatus ?? "").trim().toLowerCase();
  return fin === "refunded";
}

/**
 * Exclui da taxa UE encomendas canceladas/reembolsadas sem envio
 * (já contaram no dia; o sync corrige).
 */
export function mergeEuCustomsEligibleOrderFilter(
  match: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...match,
    $nor: [
      {
        $and: [
          {
            fulfillmentStatus: {
              $nin: [...EU_CUSTOMS_FULFILLMENT_STATUSES],
            },
          },
          {
            $or: [
              { financialStatus: /^refunded$/i },
              { cancelledAt: { $ne: null, $exists: true } },
            ],
          },
        ],
      },
    ],
  };
}

/** Filtro MongoDB — encomendas processadas para taxa UE. */
export function fulfilledOrderFindFilter(): {
  fulfillmentStatus: RegExp;
} {
  return { fulfillmentStatus: FULFILLED_ORDER_STATUS_REGEX };
}

export function mergeFulfilledOrderFilter(
  match: Record<string, unknown>,
): Record<string, unknown> {
  return { ...match, ...fulfilledOrderFindFilter() };
}
