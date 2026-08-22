export type HistoryPeriodRow = {
  id: string;
  value: number;
  source: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  periodLabel: string;
  daysActive: number;
  unitsSold: number;
  orderCount: number;
  unitsPerDay: number | null;
  revenue: number;
};

export type VariantPricingSnapshot = {
  variantId: string;
  title: string;
  currentPrice: number;
  currentCost: number;
  currency: string;
  totalUnitsSold: number;
  totalOrders: number;
  avgShippingPerUnit: number;
  avgFeesPerUnit: number;
  actualBer: number | null;
  pricePeriods: HistoryPeriodRow[];
  costPeriods: HistoryPeriodRow[];
};

export type VariantListItem = {
  variantId: string;
  title: string;
  price: number;
  unitCost: number;
  unitsSold: number;
};
