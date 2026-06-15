/** Inputs para cálculo de lucro (REV = vendas líquidas, refunds já deduzidos). */
export type ProfitInputs = {
  revenue: number;
  cogs: number;
  shipping: number;
  fees: number;
};

/** Net Profit = REV − COGS − envio − taxas − ad spend. */
export function calcNetProfit(input: ProfitInputs, adSpend = 0): number {
  return input.revenue - input.cogs - input.shipping - input.fees - adSpend;
}

export function contributionMarginPct(input: ProfitInputs): number {
  if (input.revenue <= 0) return 0;
  const cm =
    input.revenue - input.cogs - input.shipping - input.fees;
  return (cm / input.revenue) * 100;
}

/** Break-even ROAS (revenue / contribution margin). */
export function berRoas(input: ProfitInputs): number | null {
  const cm = input.revenue - input.cogs - input.shipping - input.fees;
  if (cm <= 0) return null;
  return input.revenue / cm;
}
