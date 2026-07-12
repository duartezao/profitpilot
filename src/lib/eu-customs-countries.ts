/** Países UE/EEE onde a Win-Win aplica €3 por encomenda (código ISO 3166-1 alpha-2). */
export const EU_SHIPPING_COUNTRY_CODES = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  // EEE
  "IS",
  "LI",
  "NO",
] as const;

const EU_SET = new Set<string>(EU_SHIPPING_COUNTRY_CODES);

export function normalizeShippingCountryCode(
  code: string | null | undefined,
): string | null {
  const raw = code?.trim().toUpperCase() ?? "";
  return raw.length === 2 ? raw : null;
}

export function isEuShippingCountry(code: string | null | undefined): boolean {
  const normalized = normalizeShippingCountryCode(code);
  return normalized != null && EU_SET.has(normalized);
}

/** Como filtrar encomendas sujeitas à taxa Win-Win (sem BD). */
export type EuCustomsFeeOrderScope =
  | "all_paid_orders"
  | "eu_shipping_only"
  | "none";
