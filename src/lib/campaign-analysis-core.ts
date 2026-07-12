import type {
  CampaignDecisionViewSection,
  CampaignPauseCause,
} from "@/lib/campaign-analysis-core-types";

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

/** Último dia com gasto tem de ser hoje ou ontem; senão o ciclo de análise interrompe. */
export const MAX_CALENDAR_DAYS_SINCE_LAST_SPEND = 1;

export function daysBetweenDateKeys(laterKey: string, earlierKey: string): number {
  const later = new Date(`${laterKey}T12:00:00.000Z`);
  const earlier = new Date(`${earlierKey}T12:00:00.000Z`);
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}

export type ContiguousSpendWindowResult = {
  windowDays: SpendDayRow[];
  spendDayCount: number;
  hasFullWindow: boolean;
  /** Gasto parou (conta sem budget / sem spend recente) — não usar janela antiga. */
  staleSpend: boolean;
  streakLength: number;
  lastSpendDateKey: string | null;
};

/**
 * Janela = últimos N dias **consecutivos no calendário** com spend > 0.
 * Dias com gasto 0 não entram. Lacunas no calendário cortam a série.
 * Se o último gasto não for recente, o ciclo interrompe (staleSpend).
 */
export function buildContiguousSpendWindow(
  spendDays: SpendDayRow[],
  required: number,
  referenceDateKey: string,
): ContiguousSpendWindowResult {
  const withSpend = spendDays
    .filter((d) => d.spend > 0)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  if (!withSpend.length) {
    return {
      windowDays: [],
      spendDayCount: 0,
      hasFullWindow: false,
      staleSpend: false,
      streakLength: 0,
      lastSpendDateKey: null,
    };
  }

  const lastSpendDateKey = withSpend[0]!.dateKey;
  const daysSinceLastSpend = daysBetweenDateKeys(
    referenceDateKey,
    lastSpendDateKey,
  );

  if (daysSinceLastSpend > MAX_CALENDAR_DAYS_SINCE_LAST_SPEND) {
    return {
      windowDays: [],
      spendDayCount: 0,
      hasFullWindow: false,
      staleSpend: true,
      streakLength: 0,
      lastSpendDateKey,
    };
  }

  const streak: SpendDayRow[] = [withSpend[0]!];
  for (let i = 1; i < withSpend.length; i++) {
    const gap = daysBetweenDateKeys(
      withSpend[i - 1]!.dateKey,
      withSpend[i]!.dateKey,
    );
    if (gap !== 1) break;
    streak.push(withSpend[i]!);
  }

  const windowDays = streak.slice(0, required);
  return {
    windowDays,
    spendDayCount: windowDays.length,
    hasFullWindow: streak.length >= required,
    staleSpend: false,
    streakLength: streak.length,
    lastSpendDateKey,
  };
}

/** Vendas atribuídas — Google por vezes reporta valor/receita sem contagem de conversões. */
export function hasCampaignAttributedSales(
  conversions: number,
  conversionValue: number,
): boolean {
  return conversions > 0 || conversionValue > 0;
}

export function metricsFromSpendDays(days: SpendDayRow[]) {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;
  let conversionValue = 0;
  for (const d of days) {
    if (d.spend <= 0) continue;
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

export type RoasChangeVerdict = "better" | "worse" | "same" | "early";

/** ROAS ≥ BER × isto → candidata a scale. */
export const PERFORMING_ROAS_BUFFER = 1.1;

/** ROAS < BER × isto → pausa clara; entre isto e o BER fica em observação. */
export const PAUSE_ROAS_BELOW_BER_RATIO = 0.9;

export function isRoasClearlyBelowBer(
  roas: number | null,
  ber: number | null,
): boolean {
  if (ber == null || ber <= 0 || roas == null || roas <= 0) return false;
  return roas < ber * PAUSE_ROAS_BELOW_BER_RATIO;
}

/** Compara ROAS pós-acção vs pré-acção (scale, pausa, etc.). */
export function roasChangeVerdict(
  preRoas: number | null,
  postRoas: number | null,
  postDays: number,
  minDays = 3,
): RoasChangeVerdict {
  if (postDays < minDays || preRoas == null || postRoas == null) return "early";
  if (postRoas > preRoas * 1.05) return "better";
  if (postRoas < preRoas * 0.95) return "worse";
  return "same";
}

export function classifyPerformanceBucket(
  conversions: number,
  roas: number | null,
  ber: number | null,
  hasFullWindow: boolean,
  conversionValue = 0,
): CampaignPerformanceBucket {
  if (!hasCampaignAttributedSales(conversions, conversionValue)) {
    return "no_conversions";
  }
  if (ber == null || ber <= 0 || roas == null || roas <= 0) {
    return hasFullWindow ? "marginal" : "marginal";
  }
  if (roas >= ber * PERFORMING_ROAS_BUFFER) return "performing";
  return "marginal";
}

export function decideCampaignStatus(
  bucket: CampaignPerformanceBucket,
  hasFullWindow: boolean,
  spendDays: number,
  required: number,
  roas: number | null,
  ber: number | null,
  options?: { staleSpend?: boolean; lastSpendDateKey?: string | null },
): { status: CampaignDecisionStatus; reason: string } {
  if (options?.staleSpend) {
    const last = options.lastSpendDateKey;
    return {
      status: "testing",
      reason: last
        ? `Sem gasto desde ${last} — ciclo interrompido, aguarda retoma antes de decidir.`
        : "Ciclo de gasto interrompido — aguarda retoma antes de decidir.",
    };
  }

  if (!hasFullWindow) {
    return {
      status: "testing",
      reason: `${spendDays}/${required} dias consecutivos com gasto — aguarda janela completa antes de decidir.`,
    };
  }

  if (bucket === "no_conversions") {
    return {
      status: "kill",
      reason: `${required} dias com gasto e zero vendas — pausa a campanha.`,
    };
  }

  if (bucket === "marginal") {
    if (isRoasClearlyBelowBer(roas, ber)) {
      return {
        status: "pause",
        reason: `ROAS claramente abaixo do BER — prejuízo consistente.`,
      };
    }
    return {
      status: "maintain",
      reason: `ROAS perto do BER — ainda aceitável, pode melhorar antes de pausar.`,
    };
  }

  return {
    status: "scale",
    reason: `ROAS acima do BER — candidata a aumentar budget.`,
  };
}

function formatEnglishCampaignList(names: string[]): string {
  return names.map((n) => `"${n}"`).join(", ");
}

export function classifyDecisionViewSection(input: {
  hasFullWindow: boolean;
  conversions: number;
  conversionValue?: number;
  roasValue: number | null;
  berRoas: number | null;
  bucket: CampaignPerformanceBucket;
}): CampaignDecisionViewSection {
  if (!input.hasFullWindow) return "testing";
  if (
    !hasCampaignAttributedSales(
      input.conversions,
      input.conversionValue ?? 0,
    )
  ) {
    return "pause";
  }
  if (isRoasClearlyBelowBer(input.roasValue, input.berRoas)) {
    return "pause";
  }
  if (input.bucket === "performing") return "performing";
  return "watch";
}

export function pauseCauseForRow(input: {
  hasFullWindow: boolean;
  conversions: number;
  conversionValue?: number;
  roasValue: number | null;
  berRoas: number | null;
}): CampaignPauseCause | undefined {
  if (!input.hasFullWindow) return undefined;
  if (
    !hasCampaignAttributedSales(
      input.conversions,
      input.conversionValue ?? 0,
    )
  ) {
    return "no_sales";
  }
  if (isRoasClearlyBelowBer(input.roasValue, input.berRoas)) {
    return "below_ber";
  }
  return undefined;
}

export type MediaBuyerPauseRow = {
  name: string;
  adAccountName: string;
  hasFullWindow: boolean;
  conversions: number;
  conversionValue?: number;
  roasValue: number | null;
  berRoas: number | null;
  pauseCause?: CampaignPauseCause;
};

function resolvePauseCause(row: MediaBuyerPauseRow): CampaignPauseCause | undefined {
  if (row.pauseCause) return row.pauseCause;
  if (!row.hasFullWindow) return undefined;
  if (
    !hasCampaignAttributedSales(
      row.conversions,
      row.conversionValue ?? 0,
    )
  ) {
    return "no_sales";
  }
  if (isRoasClearlyBelowBer(row.roasValue, row.berRoas)) {
    return "below_ber";
  }
  return undefined;
}

/** Mensagem em inglês para o media buyer — sem vendas + abaixo do BER. */
export function buildMediaBuyerPauseCopyMessage(
  rows: MediaBuyerPauseRow[],
  windowDays?: number,
): string | null {
  const actionable = rows
    .map((row) => ({ ...row, pauseCause: resolvePauseCause(row) }))
    .filter((r) => r.pauseCause != null && r.hasFullWindow);
  if (!actionable.length) return null;

  const days = windowDays ?? 7;
  const byAccount = new Map<string, MediaBuyerPauseRow[]>();
  for (const row of actionable) {
    const list = byAccount.get(row.adAccountName) ?? [];
    list.push(row);
    byAccount.set(row.adAccountName, list);
  }

  const sentences: string[] = [];

  for (const [account, accountRows] of byAccount) {
    const noSales = accountRows.filter((r) => r.pauseCause === "no_sales");
    const belowBer = accountRows.filter((r) => r.pauseCause === "below_ber");

    if (noSales.length) {
      const campaignList = formatEnglishCampaignList(noSales.map((r) => r.name));
      const noun = noSales.length > 1 ? "Campaigns" : "Campaign";
      sentences.push(
        `${noun} ${campaignList} from ad account "${account}" didn't convert any sales in the last ${days} days — please confirm if it's better to pause.`,
      );
    }

    if (belowBer.length) {
      const campaignList = formatEnglishCampaignList(belowBer.map((r) => r.name));
      const noun = belowBer.length > 1 ? "Campaigns" : "Campaign";
      sentences.push(
        `${noun} ${campaignList} from ad account "${account}" are below break-even in the last ${days} days — please confirm if it's better to pause.`,
      );
    }
  }

  return sentences.join("\n\n");
}

/** @deprecated Use buildMediaBuyerPauseCopyMessage */
export function buildNoConversionsPauseCopyMessage(
  rows: Array<{
    name: string;
    adAccountName: string;
    hasFullWindow: boolean;
    conversions: number;
    conversionValue?: number;
    spendDaysRequired: number;
    pauseCause?: CampaignPauseCause;
  }>,
  windowDays?: number,
): string | null {
  return buildMediaBuyerPauseCopyMessage(
    rows.map((r) => ({
      name: r.name,
      adAccountName: r.adAccountName,
      hasFullWindow: r.hasFullWindow,
      conversions: r.conversions,
      conversionValue: r.conversionValue,
      roasValue: null,
      berRoas: null,
      pauseCause:
        r.pauseCause ??
        (r.hasFullWindow &&
        !hasCampaignAttributedSales(r.conversions, r.conversionValue ?? 0)
          ? "no_sales"
          : undefined),
    })),
    windowDays,
  );
}
