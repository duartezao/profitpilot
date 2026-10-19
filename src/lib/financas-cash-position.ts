import { formatCurrency } from "@/lib/utils";

/**
 * Posição de caixa do Resumo Finanças — uma fórmula só, sem aggregate paralelo.
 *
 * Conta + a receber = saldo inicial + lucro do período (± capital)
 * Em banca         = Conta + a receber − a receber Shopify
 *
 * O `netProfit` TEM de ser o mesmo valor dos KPIs (`buildWorkspacePnl`).
 */
export type FinancasCashPositionInput = {
  periodLabel: string;
  /** Mesmo `totals.netProfit` dos KPIs do Resumo. */
  netProfit: number;
  startingBalance: number;
  manualIn: number;
  manualOut: number;
  /** Saldo Shopify por pagar + payouts a caminho (stock actual). */
  shopifyPending: number;
  currency: string;
};

export type FinancasCashPosition = {
  periodLabel: string;
  startingBalance: number;
  startingBalanceFmt: string;
  netProfit: number;
  netProfitFmt: string;
  manualIn: number;
  manualInFmt: string;
  manualOut: number;
  manualOutFmt: string;
  shopifyPending: number;
  shopifyPendingFmt: string;
  /** saldo inicial + lucro ± capital */
  projectedCash: number;
  projectedCashFmt: string;
  /** projectedCash − shopifyPending */
  cashOnHand: number;
  cashOnHandFmt: string;
};

export function computeFinancasCashPosition(
  input: FinancasCashPositionInput,
): FinancasCashPosition {
  const fmt = (v: number) => formatCurrency(v, input.currency);
  const projectedCash =
    input.startingBalance +
    input.netProfit +
    input.manualIn -
    input.manualOut;
  const cashOnHand = projectedCash - input.shopifyPending;

  return {
    periodLabel: input.periodLabel,
    startingBalance: input.startingBalance,
    startingBalanceFmt: fmt(input.startingBalance),
    netProfit: input.netProfit,
    netProfitFmt: fmt(input.netProfit),
    manualIn: input.manualIn,
    manualInFmt: fmt(input.manualIn),
    manualOut: input.manualOut,
    manualOutFmt: fmt(input.manualOut),
    shopifyPending: input.shopifyPending,
    shopifyPendingFmt: fmt(input.shopifyPending),
    projectedCash,
    projectedCashFmt: fmt(projectedCash),
    cashOnHand,
    cashOnHandFmt: fmt(cashOnHand),
  };
}
