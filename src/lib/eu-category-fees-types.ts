/** Win-Win: €3 por encomenda enviada para a UE — vigência desde 26/06/2026 (hora China). */
export const EU_CUSTOMS_FEE_EFFECTIVE_FROM = "2026-06-26";

/** @deprecated use EU_CUSTOMS_FEE_EFFECTIVE_FROM */
export const EU_CATEGORY_FEE_EFFECTIVE_FROM = EU_CUSTOMS_FEE_EFFECTIVE_FROM;

export const EU_CUSTOMS_FEE_PER_ORDER_EUR = 3;

export type EuCustomsFeeDaySummary = {
  dateKey: string;
  label: string;
  euOrders: number;
  amount: number;
  baseCurrency: string;
};

export type EuCustomsFeeAutoSummary = {
  automatic: true;
  feePerOrderEur: number;
  effectiveFrom: string;
  baseCurrency: string;
  periodEuOrders: number;
  periodFee: number;
  recentDays: EuCustomsFeeDaySummary[];
};

/** @deprecated manual entries — só legado */
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
