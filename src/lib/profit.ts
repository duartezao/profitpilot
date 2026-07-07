/** Inputs para cálculo de lucro (REV = vendas líquidas, refunds já deduzidos). */
export type ProfitInputs = {
  revenue: number;
  cogs: number;
  shipping: number;
  fees: number;
};

/** Net Profit = REV − COGS − envio − taxas − ad spend − outros custos operacionais. */
export function calcNetProfit(
  input: ProfitInputs,
  adSpend = 0,
  operatingExpenses = 0,
): number {
  return (
    input.revenue -
    input.cogs -
    input.shipping -
    input.fees -
    adSpend -
    operatingExpenses
  );
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

/** POAS = lucro líquido / ad spend */
export function calcPoas(netProfit: number, adSpend: number): number | null {
  if (adSpend <= 0) return null;
  return netProfit / adSpend;
}

export function fmtPoas(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2).replace(".", ",");
}

export function fmtBerRoas(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2).replace(".", ",");
}

export type ProfitBreakdownInput = {
  revenue: number;
  cogs: number;
  shipping?: number;
  fees?: number;
};

/** Texto legível: REV − custos − ads = lucro (para tooltips e títulos). */
export function formatProfitBreakdown(
  input: ProfitBreakdownInput,
  adSpend: number,
  fmtMoney: (v: number) => string,
  opts?: { note?: string; adSpendKnown?: boolean; operatingExpenses?: number },
): string {
  const adSpendKnown = opts?.adSpendKnown !== false;
  const adForProfit = adSpendKnown ? adSpend : 0;
  const operatingExpenses = opts?.operatingExpenses ?? 0;
  const profit = calcNetProfit(
    {
      revenue: input.revenue,
      cogs: input.cogs,
      shipping: input.shipping ?? 0,
      fees: input.fees ?? 0,
    },
    adForProfit,
    operatingExpenses,
  );
  const parts = [`REV ${fmtMoney(input.revenue)}`, `COGS −${fmtMoney(input.cogs)}`];
  if ((input.fees ?? 0) > 0) parts.push(`taxas −${fmtMoney(input.fees ?? 0)}`);
  if ((input.shipping ?? 0) > 0) {
    parts.push(`envio −${fmtMoney(input.shipping ?? 0)}`);
  }
  if (adSpendKnown && adSpend > 0) parts.push(`ads −${fmtMoney(adSpend)}`);
  if (operatingExpenses > 0) {
    parts.push(`despesas −${fmtMoney(operatingExpenses)}`);
  }
  let note = opts?.note;
  if (!note && !adSpendKnown) {
    note = "ad spend por preencher — lucro sem ads";
  }
  if (
    !note &&
    adSpendKnown &&
    input.revenue === 0 &&
    input.cogs === 0 &&
    (input.fees ?? 0) === 0 &&
    adSpend > 0
  ) {
    note = "sem vendas neste dia — só ads";
  }
  if (
    !note &&
    adSpendKnown &&
    input.revenue === 0 &&
    input.cogs === 0 &&
    (input.fees ?? 0) === 0 &&
    adSpend === 0 &&
    operatingExpenses > 0
  ) {
    note = "sem vendas — despesas operacionais";
  }
  if (
    !note &&
    adSpendKnown &&
    input.revenue === 0 &&
    input.cogs === 0 &&
    (input.fees ?? 0) === 0 &&
    adSpend === 0 &&
    operatingExpenses === 0
  ) {
    note = "sem vendas nem ads";
  }
  return `${parts.join(" · ")} = ${fmtMoney(profit)}${note ? ` (${note})` : ""}`;
}
