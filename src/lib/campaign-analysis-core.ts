export type CampaignAnalysisWindow = 5 | 7;

export type CampaignPerformanceBucket =
  | "no_conversions"
  | "marginal"
  | "performing";

export type CampaignDecisionStatus =
  | "kill"
  | "pause"
  | "maintain"
  | "scale"
  | "testing";

export type SpendDayRow = {
  dateKey: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  dailyBudget: number | null;
};

export function metricsFromSpendDays(days: SpendDayRow[]) {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;
  let conversionValue = 0;
  for (const d of days) {
    spend += d.spend;
    impressions += d.impressions;
    clicks += d.clicks;
    conversions += d.conversions;
    conversionValue += d.conversionValue;
  }
  const roas = spend > 0 && conversionValue > 0 ? conversionValue / spend : null;
  return {
    spend,
    impressions,
    clicks,
    conversions,
    conversionValue,
    roas,
    cpc: clicks > 0 ? spend / clicks : null,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
  };
}

export function classifyPerformanceBucket(
  conversions: number,
  roas: number | null,
  ber: number | null,
  hasFullWindow: boolean,
): CampaignPerformanceBucket {
  if (conversions <= 0) return "no_conversions";
  if (ber == null || ber <= 0 || roas == null || roas <= 0) {
    return hasFullWindow ? "marginal" : "marginal";
  }
  if (roas >= ber * 1.1) return "performing";
  return "marginal";
}

export function decideCampaignStatus(
  bucket: CampaignPerformanceBucket,
  hasFullWindow: boolean,
  spendDays: number,
  required: number,
  roas: number | null,
  ber: number | null,
): { status: CampaignDecisionStatus; reason: string } {
  if (!hasFullWindow) {
    return {
      status: "testing",
      reason: `${spendDays}/${required} dias com gasto — aguarda janela completa antes de decidir.`,
    };
  }

  if (bucket === "no_conversions") {
    return {
      status: "kill",
      reason: `${required} dias com gasto e zero vendas — pausa a campanha.`,
    };
  }

  if (bucket === "marginal") {
    if (ber != null && roas != null && roas < ber) {
      return {
        status: "pause",
        reason: `ROAS abaixo do BER — prejuízo ou break-even negativo.`,
      };
    }
    return {
      status: "maintain",
      reason: `ROAS perto do BER — optimiza antes de escalar.`,
    };
  }

  return {
    status: "scale",
    reason: `ROAS acima do BER — candidata a aumentar budget.`,
  };
}
