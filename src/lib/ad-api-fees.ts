/** Fees extra na conta API (fixo + % agência) sobre o gasto reportado pela plataforma. */
export type ApiAccountFees = {
  extraFeeFixed: number;
  agencyFeePercent: number;
};

export function applyApiAccountFees(
  spendPlatform: number,
  fees: ApiAccountFees,
): { spendPlatform: number; spendTotal: number; agencyFee: number } {
  const agencyFee =
    fees.agencyFeePercent > 0
      ? (spendPlatform * fees.agencyFeePercent) / 100
      : 0;
  const spendTotal = spendPlatform + fees.extraFeeFixed + agencyFee;
  return {
    spendPlatform,
    spendTotal: Number.isFinite(spendTotal) ? spendTotal : spendPlatform,
    agencyFee,
  };
}

export function roasFromValue(spend: number, conversionValue: number): number | null {
  if (spend <= 0 || conversionValue <= 0) return null;
  return conversionValue / spend;
}
