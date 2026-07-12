import {
  isEuShippingCountry,
  type EuCustomsFeeOrderScope,
} from "@/lib/eu-customs-countries";
import { sessionCountryKey } from "@/lib/shopify-countries";

export type { EuCustomsFeeOrderScope };

/**
 * País das sessões (Definições) define o mercado da loja.
 * UE → todas as encomendas pagas; fora UE → nenhuma; vazio → fallback por país de envio.
 */
export function resolveEuCustomsFeeOrderScope(
  analyticsSessionCountry: string | null | undefined,
): EuCustomsFeeOrderScope {
  const key = sessionCountryKey(analyticsSessionCountry);
  if (key) {
    return isEuShippingCountry(key) ? "all_paid_orders" : "none";
  }
  return "eu_shipping_only";
}
