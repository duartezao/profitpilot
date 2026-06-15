import "server-only";

export {
  AD_INPUT_CURRENCIES,
  type AdInputCurrency,
  isAdInputCurrency,
} from "@/lib/ad-currencies";

/** Taxas aproximadas → EUR quando as APIs falham (só último recurso). */
const FALLBACK_TO_EUR: Record<string, number> = {
  USD: 0.92,
  GBP: 1.17,
  RSD: 0.0085,
  BAM: 0.51,
  BGN: 0.51,
  MKD: 0.016,
  ALL: 0.0105,
  HRK: 0.13,
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

async function fetchFrankfurterRate(
  from: string,
  to: string,
  dateKey: string,
): Promise<number> {
  const url = `https://api.frankfurter.app/${dateKey}?from=${from}&to=${to}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const json = (await res.json()) as { rates?: Record<string, number> };
  const rate = json.rates?.[to];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new Error("Taxa Frankfurter inválida");
  }
  return rate;
}

/** API com centenas de moedas + histórico diário (fallback). */
async function fetchCurrencyApiRate(
  from: string,
  to: string,
  dateKey: string,
): Promise<number> {
  const fromLc = from.toLowerCase();
  const toLc = to.toLowerCase();

  const readRate = async (date: string): Promise<number | null> => {
    const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${fromLc}.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, Record<string, number>>;
    const rate = json[fromLc]?.[toLc];
    if (typeof rate !== "number" || !Number.isFinite(rate)) return null;
    return rate;
  };

  const direct = (await readRate(dateKey)) ?? (await readRate("latest"));
  if (direct != null) return direct;

  if (from === "USD") throw new Error("Sem taxa USD");

  const usdFromBlock = async (date: string): Promise<number | null> => {
    const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${fromLc}.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, Record<string, number>>;
    const rate = json[fromLc]?.usd;
    if (typeof rate !== "number" || !Number.isFinite(rate)) return null;
    return rate;
  };

  const fromToUsd =
    (await usdFromBlock(dateKey)) ?? (await usdFromBlock("latest"));
  if (fromToUsd == null) throw new Error("Sem taxa para USD");

  const usdToTarget = await fetchFrankfurterRate("USD", to, dateKey).catch(
    () => fetchCurrencyApiRate("USD", to, dateKey),
  );

  return fromToUsd * usdToTarget;
}

async function fetchFxRate(
  from: string,
  to: string,
  dateKey: string,
): Promise<{ rate: number; usedFallback: boolean }> {
  const key = cacheKey(dateKey, from, to);
  const cached = rateCache.get(key);
  if (cached != null) return { rate: cached, usedFallback: false };

  const attempts: Array<() => Promise<number>> = [
    () => fetchFrankfurterRate(from, to, dateKey),
    () => fetchCurrencyApiRate(from, to, dateKey),
  ];

  for (const attempt of attempts) {
    try {
      const rate = await attempt();
      rateCache.set(key, rate);
      return { rate, usedFallback: false };
    } catch {
      /* próxima fonte */
    }
  }

  const fallback = FALLBACK_TO_EUR[from];
  if (fallback != null && to === "EUR") {
    return { rate: fallback, usedFallback: true };
  }
  if (from === to) return { rate: 1, usedFallback: false };

  throw new Error(
    `Não foi possível obter taxa ${from}→${to} para ${dateKey}.`,
  );
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

/** Converte para a moeda base e devolve só o valor numérico. */
export async function moneyToBase(
  amount: number,
  fromCurrency: string,
  baseCurrency: string,
  dateKey: string,
): Promise<number> {
  if (!amount) return 0;
  const r = await convertToBaseCurrency(
    amount,
    fromCurrency,
    baseCurrency,
    dateKey,
  );
  return r.amountBase;
}
