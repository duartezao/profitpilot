/** Moedas comuns em contas de ads (entrada manual). */
export const AD_INPUT_CURRENCIES = ["USD", "EUR", "GBP"] as const;
export type AdInputCurrency = (typeof AD_INPUT_CURRENCIES)[number];

export function isAdInputCurrency(v: string): v is AdInputCurrency {
  return (AD_INPUT_CURRENCIES as readonly string[]).includes(v);
}
