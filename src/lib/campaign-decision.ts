import type { CampaignDayMetrics } from "@/lib/ad-campaign-metrics";

export type CampaignDecisionStatus = "scale" | "maintain" | "descale";

export type CampaignDecisionRow = {
  campaignId: string;
  name: string;
  platformLabel: string;
  status: CampaignDecisionStatus;
  statusLabel: string;
  spend: number;
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;
  roas: string;
  reason: string;
};

function statusLabel(status: CampaignDecisionStatus): string {
  if (status === "scale") return "Scale";
  if (status === "descale") return "Descale";
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

/**
 * Heurística v1: CTR e CPC vs média da conta + share de spend.
 * ROAS por campanha fica "—" até haver atribuição por UTM.
 */
export function buildCampaignDecisions(
  campaigns: CampaignDayMetrics[],
  opts?: { storeRevenue?: number; totalAdSpend?: number },
): CampaignDecisionRow[] {
  if (!campaigns.length) return [];

  const active = campaigns.filter((c) => c.spend > 0 || c.clicks > 0);
  if (!active.length) return [];

  const totalSpend = active.reduce((s, c) => s + c.spend, 0);
  const totalClicks = active.reduce((s, c) => s + c.clicks, 0);
  const totalImpressions = active.reduce((s, c) => s + c.impressions, 0);

  const accountCtr =
    totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null;
  const accountCpc = totalClicks > 0 ? totalSpend / totalClicks : null;

  const storeRoas =
    opts?.totalAdSpend && opts.totalAdSpend > 0 && opts.storeRevenue
      ? opts.storeRevenue / opts.totalAdSpend
      : null;

  return active.map((c) => {
    const spendShare = totalSpend > 0 ? c.spend / totalSpend : 0;
    let status: CampaignDecisionStatus = "maintain";
    let reason = "Desempenho dentro da média.";

    const ctrGood =
      accountCtr != null && c.ctr != null && c.ctr >= accountCtr * 1.08;
    const ctrWeak =
      accountCtr != null && c.ctr != null && c.ctr < accountCtr * 0.65;
    const cpcGood =
      accountCpc != null && c.cpc != null && c.cpc <= accountCpc * 0.92;
    const cpcBad =
      accountCpc != null && c.cpc != null && c.cpc >= accountCpc * 1.35;
    const noClicks = c.spend > 0 && c.clicks === 0;

    if (noClicks && c.spend >= totalSpend * 0.05) {
      status = "descale";
      reason = "Gasto sem cliques — rever criativo ou público.";
    } else if ((ctrWeak || cpcBad) && spendShare >= 0.12) {
      status = "descale";
      reason = ctrWeak
        ? "CTR abaixo da média com peso alto no spend."
        : "CPC acima da média com peso alto no spend.";
    } else if ((ctrGood || cpcGood) && spendShare >= 0.08 && c.clicks >= 3) {
      status = "scale";
      reason =
        storeRoas != null && storeRoas >= 2
          ? "CTR/CPC fortes e loja rentável — candidata a +10–15% budget."
          : "CTR/CPC acima da média — testa subir budget gradualmente.";
    }

    const allocRoas =
      storeRoas != null && spendShare > 0
        ? storeRoas * (spendShare > 0 ? 1 : 0)
        : null;

    return {
      campaignId: c.campaignId,
      name: c.campaignName,
      platformLabel: c.platformLabel,
      status,
      statusLabel: statusLabel(status),
      spend: c.spend,
      cpc: c.cpc,
      ctr: c.ctr,
      cpm: c.cpm,
      roas: allocRoas != null ? allocRoas.toFixed(2).replace(".", ",") : "—",
      reason,
    };
  });
}

export function pickBestCampaign(
  rows: CampaignDecisionRow[],
): CampaignDecisionRow | null {
  const scale = rows.filter((r) => r.status === "scale");
  if (scale.length) {
    return [...scale].sort((a, b) => b.spend - a.spend)[0] ?? null;
  }
  return [...rows].sort((a, b) => b.spend - a.spend)[0] ?? null;
}

export function buildCampaignSuggestionText(
  rows: CampaignDecisionRow[],
): string | null {
  const best = pickBestCampaign(rows);
  const descale = rows.filter((r) => r.status === "descale");
  if (!best && !descale.length) return null;

  const parts: string[] = [];
  if (best?.status === "scale") {
    parts.push(
      `Melhor campanha: ${best.name} (${best.platformLabel}) — scale (+10–15%). CTR ${fmtPct(best.ctr)}, CPC ${best.cpc != null ? fmtMoney(best.cpc, "USD") : "—"}.`,
    );
  } else if (best) {
    parts.push(`Maior spend: ${best.name} (${best.platformLabel}).`);
  }
  if (descale[0]) {
    parts.push(
      `Descale: ${descale[0].name} — ${descale[0].reason}`,
    );
  }
  return parts.join(" ");
}
