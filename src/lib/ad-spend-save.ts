import "server-only";
import {
  type AdSpendLineInput,
  type AdSpendLineStored,
  adSpendLineTotalBase,
} from "@/lib/ad-spend-platforms";
import { convertToBaseCurrency } from "@/lib/fx";

export type BuiltAdSpendDay = {
  amount: number;
  extraFee: number;
  inputAmount: number | null;
  inputCurrency: string | null;
  fxRate: number | null;
  inputExtraFee: number | null;
  lines: AdSpendLineStored[];
};

/** Converte linhas por plataforma para totais na moeda base do workspace. */
export async function buildAdSpendDayFromLines(
  lines: AdSpendLineInput[],
  inputCurrency: string,
  baseCurrency: string,
  dateKey: string,
): Promise<BuiltAdSpendDay> {
  const stored: AdSpendLineStored[] = [];

  for (const line of lines) {
    let amountBase = 0;
    let fxRate: number | null = null;
    let inputAmount = 0;

    if (line.spend > 0) {
      const fx = await convertToBaseCurrency(
        line.spend,
        inputCurrency,
        baseCurrency,
        dateKey,
      );
      amountBase = fx.amountBase;
      fxRate = fx.fxRate;
      inputAmount = fx.inputAmount;
    }

    let extraFeeBase = 0;
    let inputExtraFee: number | null = null;
    if (line.extraFeeFixed > 0) {
      const fxExtra = await convertToBaseCurrency(
        line.extraFeeFixed,
        inputCurrency,
        baseCurrency,
        dateKey,
      );
      extraFeeBase = fxExtra.amountBase;
      inputExtraFee = line.extraFeeFixed;
    }

    let agencyFeeAmount = 0;
    let inputAgencyFeeAmount: number | null = null;
    if (line.agencyFeePercent > 0 && line.spend > 0) {
      const feeInput = (line.spend * line.agencyFeePercent) / 100;
      const fxAgency = await convertToBaseCurrency(
        feeInput,
        inputCurrency,
        baseCurrency,
        dateKey,
      );
      agencyFeeAmount = fxAgency.amountBase;
      inputAgencyFeeAmount = feeInput;
    }

    stored.push({
      platform: line.platform,
      inputAmount,
      inputCurrency,
      amount: amountBase,
      fxRate,
      extraFee: extraFeeBase,
      inputExtraFee,
      agencyFeePercent: line.agencyFeePercent,
      agencyFeeAmount,
      inputAgencyFeeAmount,
    });
  }

  const amount = stored.reduce((s, l) => s + l.amount, 0);
  const extraFee = stored.reduce(
    (s, l) => s + l.extraFee + l.agencyFeeAmount,
    0,
  );
  const inputAmountSum = stored.reduce((s, l) => s + l.inputAmount, 0);

  return {
    amount,
    extraFee,
    inputAmount: inputAmountSum > 0 ? inputAmountSum : null,
    inputCurrency: inputAmountSum > 0 ? inputCurrency : null,
    fxRate: stored.length === 1 ? stored[0]!.fxRate : null,
    inputExtraFee: stored.reduce(
      (s, l) => s + (l.inputExtraFee ?? 0) + (l.inputAgencyFeeAmount ?? 0),
      0,
    ) || null,
    lines: stored,
  };
}

export function totalBaseFromBuilt(day: BuiltAdSpendDay): number {
  return day.amount + day.extraFee;
}

export function totalBaseFromLines(lines: AdSpendLineStored[]): number {
  return lines.reduce((s, l) => s + adSpendLineTotalBase(l), 0);
}
