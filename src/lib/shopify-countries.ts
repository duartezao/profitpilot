import {
  ISO_COUNTRY_CODES,
  ISO_COUNTRY_CODE_SET,
} from "@/lib/iso-country-codes";

/** Nomes em inglês usados pelo ShopifyQL em `session_country` (quando diferem do Intl). */
const SHOPIFY_SESSION_NAME_OVERRIDES: Record<string, string> = {
  CZ: "Czech Republic",
  GB: "United Kingdom",
  US: "United States",
  MK: "North Macedonia",
  PS: "Palestinian Territory",
  SZ: "Swaziland",
  CI: "Cote d'Ivoire",
  LA: "Laos",
  MD: "Moldova",
  RU: "Russia",
  KR: "South Korea",
  KP: "North Korea",
  SY: "Syria",
  TW: "Taiwan",
  TZ: "Tanzania",
  VN: "Vietnam",
  VE: "Venezuela",
  BO: "Bolivia",
  BN: "Brunei",
  CV: "Cape Verde",
  FM: "Micronesia",
  IR: "Iran",
};

const DisplayNamesRegion = Intl.DisplayNames as unknown as new (
  locales: string | string[],
  options: { type: "region" },
) => Intl.DisplayNames;

const enRegionNames =
  typeof Intl !== "undefined"
    ? new DisplayNamesRegion("en", { type: "region" })
    : null;

const ptRegionNames =
  typeof Intl !== "undefined"
    ? new DisplayNamesRegion("pt-PT", { type: "region" })
    : null;

export type SessionCountryOption = {
  code: string;
  label: string;
  shopifyName: string;
};

export function sessionCountryShopifyName(code: string): string {
  return (
    SHOPIFY_SESSION_NAME_OVERRIDES[code] ??
    enRegionNames?.of(code) ??
    code
  );
}

export function sessionCountryLabel(code: string | null | undefined): string {
  if (!code) return "Todos os países";
  const normalized = normalizeSessionCountry(code);
  if (normalized) {
    return ptRegionNames?.of(normalized) ?? sessionCountryShopifyName(normalized);
  }
  return code;
}

/**
 * Valor guardado na loja: código ISO (ex. BE) ou null = todos.
 * Aceita nomes em inglês legados (ex. Belgium) e converte para ISO.
 */
export function normalizeSessionCountry(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  const v = value.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(v)) {
    return ISO_COUNTRY_CODE_SET.has(v) ? v : null;
  }
  const legacy = value.trim();
  for (const code of ISO_COUNTRY_CODES) {
    if (sessionCountryShopifyName(code) === legacy) return code;
  }
  return null;
}

export function isValidSessionCountry(value: string | null): boolean {
  if (!value) return true;
  return normalizeSessionCountry(value) !== null;
}

/** Chave compacta para persistência de métricas (código ISO ou ""). */
export function sessionCountryKey(code: string | null | undefined): string {
  return normalizeSessionCountry(code) ?? "";
}

/** Lista completa para o seletor — todos os países ISO, ordenados A–Z em PT. */
const SORTED_SESSION_COUNTRY_OPTIONS: SessionCountryOption[] = [
  ...ISO_COUNTRY_CODES,
]
  .sort((a, b) =>
    sessionCountryLabel(a).localeCompare(sessionCountryLabel(b), "pt-PT"),
  )
  .map((code) => ({
    code,
    label: sessionCountryLabel(code),
    shopifyName: sessionCountryShopifyName(code),
  }));

export function listSessionCountryOptions(): SessionCountryOption[] {
  return SORTED_SESSION_COUNTRY_OPTIONS;
}

/** Nome em inglês para o filtro ShopifyQL a partir do valor guardado na loja. */
export function sessionCountryForShopifyQL(
  stored: string | null | undefined,
): string | null {
  const code = normalizeSessionCountry(stored);
  if (!code) return null;
  return sessionCountryShopifyName(code);
}

export { ISO_COUNTRY_CODES };
