/** Shopify EU: 3 € por categoria por encomenda — vigência global. */
export const EU_CATEGORY_FEE_EFFECTIVE_FROM = "2026-06-29";

export type EuCategoryFeeEntry = {
  dateKey: string;
  label: string;
  amount: number;
  inputAmount: number | null;
  inputCurrency: string | null;
  fxRate: number | null;
  note: string;
  baseCurrency: string;
};
