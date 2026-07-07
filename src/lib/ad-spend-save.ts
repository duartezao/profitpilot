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

/** Constrói um dia com 0€ em todas as plataformas (confirmado pelo utilizador). */
export function buildZeroAdSpendDay(
  inputCurrency: string,
  baseCurrency: string,
): BuiltAdSpendDay {
  return {
    amount: 0,
    extraFee: 0,
    inputAmount: 0,
    inputCurrency,
    fxRate: inputCurrency === baseCurrency ? 1 : null,
    inputExtraFee: 0,
    lines: [],
  };
}

/** Converte uma linha de gasto para a moeda base (idempotente por sync). */
export async function buildAdSpendLineFromInput(
  line: AdSpendLineInput,
  inputCurrency: string,
  baseCurrency: string,
  dateKey: string,
): Promise<AdSpendLineStored> {
  const lineCurrency = (line.inputCurrency ?? inputCurrency).toUpperCase();

  let amountBase = 0;
  let fxRate: number | null = null;
  let inputAmount = 0;

  if (line.spend > 0) {
    const fx = await convertToBaseCurrency(
      line.spend,
      lineCurrency,
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
      lineCurrency,
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
      lineCurrency,
      baseCurrency,
      dateKey,
    );
    agencyFeeAmount = fxAgency.amountBase;
    inputAgencyFeeAmount = feeInput;
  }

  return {
    platform: line.platform,
    inputAmount,
    inputCurrency: lineCurrency,
    amount: amountBase,
    fxRate,
    extraFee: extraFeeBase,
    inputExtraFee,
    agencyFeePercent: line.agencyFeePercent,
    agencyFeeAmount,
    inputAgencyFeeAmount,
  };
}

/** Agrega linhas já convertidas (sem reconverter — evita duplicar em re-sync). */
export function summarizeAdSpendLines(lines: AdSpendLineStored[]): BuiltAdSpendDay {
  const amount = lines.reduce((s, l) => s + l.amount, 0);
  const extraFee = lines.reduce(
    (s, l) => s + l.extraFee + l.agencyFeeAmount,
    0,
  );
  const inputAmountSum = lines.reduce((s, l) => s + l.inputAmount, 0);
  const currencies = new Set(lines.map((l) => l.inputCurrency));
  const inputExtraFeeSum = lines.reduce(
    (s, l) => s + (l.inputExtraFee ?? 0) + (l.inputAgencyFeeAmount ?? 0),
    0,
  );

  return {
    amount,
    extraFee,
    inputAmount: inputAmountSum > 0 ? inputAmountSum : null,
    inputCurrency:
      currencies.size === 1 ? [...currencies][0]! : currencies.size > 0 ? "MIXED" : null,
    fxRate: lines.length === 1 ? lines[0]!.fxRate : null,
    inputExtraFee: inputExtraFeeSum > 0 ? inputExtraFeeSum : null,
    lines,
  };
}

/** Converte linhas por plataforma para totais na moeda base do workspace. */
export async function buildAdSpendDayFromLines(
  lines: AdSpendLineInput[],
  inputCurrency: string,
  baseCurrency: string,
  dateKey: string,
): Promise<BuiltAdSpendDay> {
  const stored: AdSpendLineStored[] = [];
  for (const line of lines) {
    stored.push(
      await buildAdSpendLineFromInput(line, inputCurrency, baseCurrency, dateKey),
    );
  }
  return summarizeAdSpendLines(stored);
}

export function totalBaseFromBuilt(day: BuiltAdSpendDay): number {
  return day.amount + day.extraFee;
}

export function totalBaseFromLines(lines: AdSpendLineStored[]): number {
  return lines.reduce((s, l) => s + adSpendLineTotalBase(l), 0);
}
