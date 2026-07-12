import type { CampaignDayMetrics } from "@/lib/ad-campaign-metrics";

export const CAMPAIGN_TEST_PHASE_DAYS = 7;
export const CAMPAIGN_EXTENDED_TEST_DAYS = 14;

export type CampaignDecisionStatus = "scale" | "maintain" | "descale" | "kill";

export type CampaignDecisionRow = {
  campaignId: string;
  name: string;
  platformLabel: string;
  status: CampaignDecisionStatus;
  statusLabel: string;
  spend: number;
  daysRunning: number | null;
  conversions: number;
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;
  roas: string;
  /** ROAS numérico para ordenação (não exposto na UI). */
  roasValue: number | null;
  reason: string;
};

export type CampaignDecisionOptions = {
  /** BER (break-even ROAS) da loja no período — obrigatório para scale. */
  storeBer?: number | null;
  storeRevenue?: number;
  totalAdSpend?: number;
};

const SCALE_BUFFER = 1.1;
const MIN_SPEND_SHARE_SCALE = 0.08;
const MIN_SPEND_SHARE_DESCALE = 0.08;
const MIN_CLICKS_FOR_SCALE = 3;

function statusLabel(status: CampaignDecisionStatus): string {
  if (status === "scale") return "Scale";
  if (status === "descale") return "Descale";
  if (status === "kill") return "Kill";
  return "Manter";
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(2).replace(".", ",")}%`;
}

function fmtMoney(v: number, currency: string): string {
  const n = v.toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "EUR" ? `${n} €` : `${n} ${currency}`;
}

function fmtRoas(v: number | null): string {
  if (v == null || v <= 0) return "—";
  return `${v.toFixed(2).replace(".", ",")}x`;
}

function campaignRoas(c: CampaignDayMetrics): number | null {
  if (c.lifetimeRoas != null && c.lifetimeRoas > 0) return c.lifetimeRoas;
  if (c.roas != null && c.roas > 0) return c.roas;
  if (c.spend > 0 && c.conversionValue > 0) return c.conversionValue / c.spend;
  return null;
}

function hasLifetimeAttributedSales(c: CampaignDayMetrics): boolean {
  const conversions =
    c.lifetimeConversions != null ? c.lifetimeConversions : c.conversions;
  const conversionValue =
    c.lifetimeConversionValue != null
      ? c.lifetimeConversionValue
      : c.conversionValue;
  return conversions > 0 || conversionValue > 0;
}

function lifetimeConversions(c: CampaignDayMetrics): number {
  if (c.lifetimeConversions != null && c.lifetimeConversions > 0) {
    return c.lifetimeConversions;
  }
  if (c.conversions > 0) return c.conversions;
  if (hasLifetimeAttributedSales(c)) return 1;
  return 0;
}

type RoasVsBer = "above" | "at" | "below" | "unknown";

function roasVsBer(roas: number | null, ber: number | null): RoasVsBer {
  if (roas == null || roas <= 0) return "unknown";
  if (ber == null || ber <= 0) return "unknown";
  if (roas >= ber * SCALE_BUFFER) return "above";
  if (roas < ber) return "below";
  return "at";
}

type LifecycleVerdict =
  | { status: CampaignDecisionStatus; reason: string }
  | null;

/**
 * Regras de teste: 7 dias sem conversões → kill;
 * ROAS abaixo do BER → segunda janela até 14 dias, depois kill.
 */
function lifecycleVerdict(
  c: CampaignDayMetrics,
  ber: number | null,
): LifecycleVerdict {
  const days = c.daysRunning ?? 0;
  if (days <= 0) return null;

  const conv = lifetimeConversions(c);
  const roas = campaignRoas(c);
  const roasFmt = fmtRoas(roas);
  const berFmt = fmtRoas(ber);

  if (days < CAMPAIGN_TEST_PHASE_DAYS) {
    return {
      status: "maintain",
      reason: `Em teste — dia ${days} de ${CAMPAIGN_TEST_PHASE_DAYS}. Aguarda antes de matar.`,
    };
  }

  if (conv <= 0) {
    return {
      status: "kill",
      reason: `${days} dias activos sem conversões — pausa a campanha.`,
    };
  }

  const vs = roasVsBer(roas, ber);
  if (vs === "below") {
    if (days < CAMPAIGN_EXTENDED_TEST_DAYS) {
      return {
        status: "maintain",
        reason: `ROAS ${roasFmt} abaixo do BER (${berFmt}) — segunda janela de ${CAMPAIGN_TEST_PHASE_DAYS} dias (dia ${days} de ${CAMPAIGN_EXTENDED_TEST_DAYS}).`,
      };
    }
    return {
      status: "kill",
      reason: `${CAMPAIGN_EXTENDED_TEST_DAYS}+ dias com ROAS ${roasFmt} abaixo do BER (${berFmt}) — pausa.`,
    };
  }

  return null;
}

/**
 * Scale/descale/kill com base no ciclo de teste (7/14 dias) e ROAS vs BER.
 */
export function buildCampaignDecisions(
  campaigns: CampaignDayMetrics[],
  opts?: CampaignDecisionOptions,
): CampaignDecisionRow[] {
  if (!campaigns.length) return [];

  const eligible = campaigns.filter(
    (c) =>
      c.isActiveCampaign ||
      c.spend > 0 ||
      c.impressions > 0 ||
      c.clicks > 0 ||
      c.conversions > 0 ||
      (c.daysRunning ?? 0) > 0,
  );
  if (!eligible.length) return [];

  const totalSpend = eligible.reduce((s, c) => s + c.spend, 0);
  const totalClicks = eligible.reduce((s, c) => s + c.clicks, 0);
  const totalImpressions = eligible.reduce((s, c) => s + c.impressions, 0);

  const accountCtr =
    totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null;
  const accountCpc = totalClicks > 0 ? totalSpend / totalClicks : null;

  const ber = opts?.storeBer ?? null;
  const berFmt = fmtRoas(ber);

  return eligible.map((c) => {
    const spendShare = totalSpend > 0 ? c.spend / totalSpend : 0;
    const roas = campaignRoas(c);
    const vs = roasVsBer(roas, ber);
    const roasFmt = fmtRoas(roas);
    const conv = lifetimeConversions(c);
    const days = c.daysRunning ?? null;

    const lifecycle = lifecycleVerdict(c, ber);
    if (lifecycle) {
      return {
        campaignId: c.campaignId,
        name: c.campaignName,
        platformLabel: c.platformLabel,
        status: lifecycle.status,
        statusLabel: statusLabel(lifecycle.status),
        spend: c.spend,
        daysRunning: days,
        conversions: conv,
        cpc: c.cpc,
        ctr: c.ctr,
        cpm: c.cpm,
        roas: roasFmt,
        roasValue: roas,
        reason: lifecycle.reason,
      };
    }

    let status: CampaignDecisionStatus = "maintain";
    let reason = "Desempenho dentro do intervalo aceitável.";

    const noClicks = c.spend > 0 && c.clicks === 0;
    const ctrGood =
      accountCtr != null && c.ctr != null && c.ctr >= accountCtr * 1.08;
    const cpcGood =
      accountCpc != null && c.cpc != null && c.cpc <= accountCpc * 0.92;
    const trafficHint =
      ctrGood || cpcGood ? " CTR/CPC acima da média." : "";

    if (noClicks && spendShare >= 0.05) {
      status = "descale";
      reason = "Gasto sem cliques — rever criativo ou público.";
    } else if (vs === "below" && spendShare >= MIN_SPEND_SHARE_DESCALE) {
      status = "descale";
      reason = `ROAS ${roasFmt} abaixo do BER da loja (${berFmt}) — campanha não rentável.`;
    } else if (
      vs === "above" &&
      spendShare >= MIN_SPEND_SHARE_SCALE &&
      c.clicks >= MIN_CLICKS_FOR_SCALE
    ) {
      status = "scale";
      reason = `ROAS ${roasFmt} acima do BER (${berFmt}) — candidata a +10–15% budget.${trafficHint}`;
    } else if (vs === "at") {
      status = "maintain";
      reason = `ROAS ${roasFmt} perto do BER (${berFmt}) — manter e optimizar antes de escalar.${trafficHint}`;
    } else if (ber == null) {
      status = "maintain";
      reason =
        "BER da loja indisponível (COGS incompleto) — não escalar só por métricas de tráfego.";
    } else if (vs === "unknown" && spendShare >= 0.08) {
      status = "maintain";
      reason = `Sem ROAS da API — não escalar só por CTR/CPC (BER loja ${berFmt}).`;
    } else if (vs === "below" && spendShare < MIN_SPEND_SHARE_DESCALE) {
      status = "maintain";
      reason = `ROAS ${roasFmt} abaixo do BER (${berFmt}) mas peso baixo no spend — monitorizar.`;
    }

    return {
      campaignId: c.campaignId,
      name: c.campaignName,
      platformLabel: c.platformLabel,
      status,
      statusLabel: statusLabel(status),
      spend: c.spend,
      daysRunning: days,
      conversions: conv,
      cpc: c.cpc,
      ctr: c.ctr,
      cpm: c.cpm,
      roas: roasFmt,
      roasValue: roas,
      reason,
    };
  });
}

export function pickBestCampaign(
  rows: CampaignDecisionRow[],
): CampaignDecisionRow | null {
  const scale = rows.filter((r) => r.status === "scale");
  if (scale.length) {
    return (
      [...scale].sort((a, b) => (b.roasValue ?? 0) - (a.roasValue ?? 0))[0] ??
      null
    );
  }

  const withRoas = rows.filter(
    (r) => r.status !== "kill" && r.roasValue != null && r.roasValue > 0,
  );
  if (withRoas.length) {
    return (
      [...withRoas].sort(
        (a, b) => (b.roasValue ?? 0) - (a.roasValue ?? 0),
      )[0] ?? null
    );
  }

  return (
    [...rows]
      .filter((r) => r.status !== "kill")
      .sort((a, b) => b.spend - a.spend)[0] ?? null
  );
}

export function buildCampaignSuggestionText(
  rows: CampaignDecisionRow[],
  storeBer?: string | null,
): string | null {
  const best = pickBestCampaign(rows);
  const kill = rows.filter((r) => r.status === "kill");
  const descale = rows.filter((r) => r.status === "descale");
  if (!best && !descale.length && !kill.length) return null;

  const berPart = storeBer ? ` (BER loja ${storeBer}x)` : "";
  const parts: string[] = [];
  if (best?.status === "scale") {
    parts.push(
      `Melhor campanha: ${best.name} (${best.platformLabel}) — scale (+10–15%). ROAS ${best.roas}${berPart}, CTR ${fmtPct(best.ctr)}, CPC ${best.cpc != null ? fmtMoney(best.cpc, "EUR") : "—"}.`,
    );
  } else if (best) {
    parts.push(
      `Maior ROAS: ${best.name} (${best.platformLabel}) — ROAS ${best.roas}${berPart}.`,
    );
  }
  if (kill[0]) {
    parts.push(`Kill: ${kill[0].name} — ${kill[0].reason}`);
  }
  if (descale[0]) {
    parts.push(`Descale: ${descale[0].name} — ${descale[0].reason}`);
  }
  return parts.join(" ");
}
