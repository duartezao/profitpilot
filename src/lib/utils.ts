import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata um valor monetário na moeda base (default EUR). */
export function formatCurrency(value: number, currency = "EUR", locale = "pt-PT") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Versão compacta para headlines/KPIs: números grandes não estouram a box.
 * Ex.: 54000 → "54 mil €", 100000 → "100 mil €", 1234567 → "1,2 M €".
 * Abaixo de 10 mil mantém o valor exato (sem casas decimais se for inteiro).
 */
export function formatCurrencyCompact(
  value: number,
  currency = "EUR",
  locale = "pt-PT",
) {
  const abs = Math.abs(value);
  if (abs < 10_000) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Formata uma percentagem (recebe 0–100). */
export function formatPercent(value: number, locale = "pt-PT") {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}
