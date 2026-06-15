import "server-only";

export { AD_INPUT_CURRENCIES, type AdInputCurrency, isAdInputCurrency } from "@/lib/ad-currencies";

const FALLBACK_TO_EUR: Record<string, number> = {
  USD: 0.92,
  GBP: 1.17,
};

export type FxConversion = {
  amountBase: number;
  inputAmount: number;
  inputCurrency: string;
  baseCurrency: string;
  fxRate: number;
  usedFallback: boolean;
};

const rateCache = new Map<string, number>();

function cacheKey(dateKey: string, from: string, to: string) {
  return `${dateKey}:${from}:${to}`;
}

async function fetchFxRate(
  from: string,
  to: string,
  dateKey: string,
): Promise<{ rate: number; usedFallback: boolean }> {
  const key = cacheKey(dateKey, from, to);
  const cached = rateCache.get(key);
  if (cached != null) return { rate: cached, usedFallback: false };

  try {
    const url = `https://api.frankfurter.app/${dateKey}?from=${from}&to=${to}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`FX ${res.status}`);
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json.rates?.[to];
    if (typeof rate !== "number" || !Number.isFinite(rate)) {
      throw new Error("Taxa inválida");
    }
    rateCache.set(key, rate);
    return { rate, usedFallback: false };
  } catch {
    const fallback = FALLBACK_TO_EUR[from];
    if (fallback != null && to === "EUR") {
      return { rate: fallback, usedFallback: true };
    }
    if (from === to) return { rate: 1, usedFallback: false };
    throw new Error(
      `Não foi possível obter taxa ${from}→${to} para ${dateKey}.`,
    );
  }
}

/** Converte um valor para a moeda base do workspace (ex.: EUR). */
export async function convertToBaseCurrency(
  inputAmount: number,
  inputCurrency: string,
  baseCurrency: string,
  dateKey: string,
): Promise<FxConversion> {
  const from = inputCurrency.toUpperCase();
  const to = baseCurrency.toUpperCase();

  if (from === to) {
    return {
      amountBase: roundMoney(inputAmount),
      inputAmount: roundMoney(inputAmount),
      inputCurrency: from,
      baseCurrency: to,
      fxRate: 1,
      usedFallback: false,
    };
  }

  const { rate, usedFallback } = await fetchFxRate(from, to, dateKey);
  return {
    amountBase: roundMoney(inputAmount * rate),
    inputAmount: roundMoney(inputAmount),
    inputCurrency: from,
    baseCurrency: to,
    fxRate: rate,
    usedFallback,
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
