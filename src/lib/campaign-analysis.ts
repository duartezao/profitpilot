import "server-only";
import mongoose from "mongoose";
import { AdCampaignDay } from "@/models/AdCampaignDay";
import { CampaignScaleEvent } from "@/models/CampaignScaleEvent";
import type { AdPlatform } from "@/lib/ad-spend-platforms";
import { AD_PLATFORM_LABELS } from "@/lib/ad-spend-platforms";
import { roasFromCampaign } from "@/lib/ad-campaign-types";
import { formatDateInput } from "@/lib/period";
import {
  metricsFromSpendDays,
  type CampaignAnalysisWindow,
  type CampaignDecisionStatus,
  type CampaignPerformanceBucket,
  type SpendDayRow,
} from "@/lib/campaign-analysis-core";
import type {
  CampaignDecisionAnalysis,
  CampaignDecisionRow,
  CampaignDecisionSection,
  CampaignPostScaleSnapshot,
  CampaignScaleSnapshot,
} from "@/lib/campaign-analysis-core-types";

export type {
  CampaignAnalysisWindow,
  CampaignPerformanceBucket,
  CampaignDecisionStatus,
  CampaignDecisionRow,
  CampaignDecisionSection,
  CampaignDecisionAnalysis,
};

type SpendDayRowLocal = SpendDayRow;

type CampaignSpendSeries = {
  campaignId: string;
  campaignName: string;
  platform: AdPlatform;
  adAccountId: string;
  spendDays: SpendDayRowLocal[];
};

const SCALE_BUFFER = 1.1;
const MARGINAL_UPPER = 1.05;

function fmtRoas(v: number | null): string {
  if (v == null || v <= 0) return "—";
  return `${v.toFixed(2).replace(".", ",")}x`;
}

function fmtMoney(v: number, currency: string): string {
  const n = v.toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "EUR" ? `${n} €` : `${n} ${currency}`;
}

function statusLabel(status: CampaignDecisionStatus): string {
  if (status === "kill") return "Pausar";
  if (status === "pause") return "Pausar";
  if (status === "scale") return "Scale";
  if (status === "testing") return "Em teste";
  return "Manter";
}

function classifyBucket(
  conversions: number,
  roas: number | null,
  ber: number | null,
  hasFullWindow: boolean,
): CampaignPerformanceBucket {
  if (conversions <= 0) return "no_conversions";
  if (ber == null || ber <= 0 || roas == null || roas <= 0) {
    return hasFullWindow ? "marginal" : "marginal";
  }
  if (roas >= ber * SCALE_BUFFER) return "performing";
  if (roas < ber * MARGINAL_UPPER) return "marginal";
  return "marginal";
}

function decideStatus(
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
        reason: `ROAS ${fmtRoas(roas)} abaixo do BER (${fmtRoas(ber)}) — prejuízo ou break-even negativo.`,
      };
    }
    return {
      status: "maintain",
      reason: `ROAS ${fmtRoas(roas)} perto do BER (${fmtRoas(ber)}) — optimiza antes de escalar.`,
    };
  }

  return {
    status: "scale",
    reason: `ROAS ${fmtRoas(roas)} acima do BER (${fmtRoas(ber)}) — candidata a aumentar budget.`,
  };
}

function buildAgentBrief(input: {
  storeName: string;
  adAccountName: string;
  platformLabel: string;
  row: Omit<CampaignDecisionRow, "agentBrief">;
  currency: string;
}): string {
  const { row } = input;
  const action =
    row.status === "kill" || row.status === "pause"
      ? "Recomendação: pausar"
      : row.status === "scale"
        ? "Recomendação: escalar budget"
        : row.status === "testing"
          ? "Recomendação: aguardar mais dias com gasto"
          : "Recomendação: manter";

  const conv =
    row.conversions <= 0
      ? "não converteu (0 vendas)"
      : `${row.conversions} venda${row.conversions === 1 ? "" : "s"}`;

  return [
    `Loja: ${input.storeName}`,
    `Ad account: ${input.adAccountName} (${input.platformLabel})`,
    `Campanha: ${row.name}`,
    `Janela: últimos ${row.spendDays}/${row.spendDaysRequired} dias com gasto`,
    `Gasto: ${fmtMoney(row.spend, input.currency)} · ${conv} · ROAS ${row.roas}`,
    action,
    row.reason,
  ].join("\n");
}

async function loadCampaignSpendSeries(
  storeId: string,
  adAccountIds: string[],
  maxSpendDays = 14,
): Promise<CampaignSpendSeries[]> {
  if (!adAccountIds.length) return [];

  const storeOid = new mongoose.Types.ObjectId(storeId);
  const accountOids = adAccountIds.map((id) => new mongoose.Types.ObjectId(id));

  const rows = await AdCampaignDay.find({
    storeId: storeOid,
    adAccountId: { $in: accountOids },
    spend: { $gt: 0 },
  })
    .select(
      "campaignId campaignName platform adAccountId dateKey spend impressions clicks conversions conversionValue dailyBudget",
    )
    .sort({ dateKey: -1 })
    .lean();

  const byKey = new Map<string, CampaignSpendSeries>();

  for (const r of rows) {
    const platform = r.platform as AdPlatform;
    const adAccountId = String(r.adAccountId);
    const key = `${platform}:${adAccountId}:${r.campaignId}`;
    let series = byKey.get(key);
    if (!series) {
      series = {
        campaignId: r.campaignId,
        campaignName: r.campaignName?.trim() || "Campanha",
        platform,
        adAccountId,
        spendDays: [],
      };
      byKey.set(key, series);
    }
    if (series.spendDays.length >= maxSpendDays) continue;
    series.spendDays.push({
      dateKey: r.dateKey,
      spend: r.spend ?? 0,
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
      conversions: r.conversions ?? 0,
      conversionValue: r.conversionValue ?? 0,
      dailyBudget:
        r.dailyBudget != null && r.dailyBudget > 0 ? r.dailyBudget : null,
    });
  }

  return [...byKey.values()];
}

async function loadLatestScaleEvents(
  storeId: string,
  adAccountIds: string[],
): Promise<Map<string, CampaignScaleSnapshot>> {
  const out = new Map<string, CampaignScaleSnapshot>();
  if (!adAccountIds.length) return out;

  const storeOid = new mongoose.Types.ObjectId(storeId);
  const accountOids = adAccountIds.map((id) => new mongoose.Types.ObjectId(id));

  const rows = await CampaignScaleEvent.find({
    storeId: storeOid,
    adAccountId: { $in: accountOids },
  })
    .sort({ dateKey: -1 })
    .lean();

  for (const r of rows) {
    const key = `${r.platform}:${String(r.adAccountId)}:${r.campaignId}`;
    if (out.has(key)) continue;
    out.set(key, {
      dateKey: r.dateKey,
      fromBudget: r.previousBudget,
      toBudget: r.newBudget,
      currency: r.currency ?? "EUR",
      preSpendDays: r.preSpendDays ?? 0,
      preSpend: r.preSpend ?? 0,
      preConversions: r.preConversions ?? 0,
      preRoas: r.preRoas ?? null,
    });
  }

  return out;
}

function postScaleMetrics(
  scale: CampaignScaleSnapshot,
  allSpendDays: SpendDayRow[],
): CampaignPostScaleSnapshot | undefined {
  const after = allSpendDays.filter((d) => d.dateKey > scale.dateKey);
  if (!after.length) return undefined;
  const m = metricsFromSpendDays(after);
  const preRoas = scale.preRoas;
  let verdict: CampaignPostScaleSnapshot["verdict"] = "early";
  if (after.length >= 3 && preRoas != null && m.roas != null) {
    if (m.roas > preRoas * 1.05) verdict = "better";
    else if (m.roas < preRoas * 0.95) verdict = "worse";
    else verdict = "same";
  }
  return {
    spendDays: after.length,
    spend: m.spend,
    conversions: m.conversions,
    roas: m.roas,
    verdict,
  };
}

const SECTION_META: Record<
  CampaignPerformanceBucket,
  { title: string; description: string }
> = {
  no_conversions: {
    title: "Sem vendas",
    description:
      "Campanhas com dias de gasto completos e zero conversões — prioridade para pausar.",
  },
  marginal: {
    title: "Break-even ou perda",
    description:
      "ROAS no BER ou abaixo — rever criativo, público ou pausar.",
  },
  performing: {
    title: "A performar bem",
    description: "ROAS acima do BER — candidatas a scale.",
  },
};

export async function buildCampaignDecisionAnalysis(input: {
  storeId: string;
  storeName: string;
  windowDays: CampaignAnalysisWindow;
  adAccounts: Array<{ id: string; name: string; platform: AdPlatform }>;
  storeBer: number | null;
  currency?: string;
}): Promise<CampaignDecisionAnalysis> {
  const accountIds = input.adAccounts.map((a) => a.id);
  const accountNames = new Map(
    input.adAccounts.map((a) => [a.id, a.name || a.id]),
  );
  const currency = input.currency ?? "EUR";

  const [seriesList, scaleMap] = await Promise.all([
    loadCampaignSpendSeries(input.storeId, accountIds, input.windowDays + 7),
    loadLatestScaleEvents(input.storeId, accountIds),
  ]);

  const rows: CampaignDecisionRow[] = [];

  for (const series of seriesList) {
    const windowDays = series.spendDays.slice(0, input.windowDays);
    const spendDays = windowDays.length;
    const hasFullWindow = spendDays >= input.windowDays;
    const m = metricsFromSpendDays(windowDays);
    const ber = input.storeBer;
    const bucket = classifyBucket(
      m.conversions,
      m.roas,
      ber,
      hasFullWindow,
    );
    const { status, reason } = decideStatus(
      bucket,
      hasFullWindow,
      spendDays,
      input.windowDays,
      m.roas,
      ber,
    );

    const scaleKey = `${series.platform}:${series.adAccountId}:${series.campaignId}`;
    const lastScale = scaleMap.get(scaleKey);
    const postScale = lastScale
      ? postScaleMetrics(lastScale, series.spendDays)
      : undefined;

    const adAccountName =
      accountNames.get(series.adAccountId) ?? series.adAccountId;

    const base: Omit<CampaignDecisionRow, "agentBrief"> = {
      campaignId: series.campaignId,
      adAccountId: series.adAccountId,
      adAccountName,
      name: series.campaignName,
      platform: series.platform,
      platformLabel: AD_PLATFORM_LABELS[series.platform] ?? series.platform,
      bucket,
      status,
      statusLabel: statusLabel(status),
      spendDays,
      spendDaysRequired: input.windowDays,
      hasFullWindow,
      spend: m.spend,
      conversions: m.conversions,
      conversionValue: m.conversionValue,
      roas: fmtRoas(m.roas),
      roasValue: m.roas,
      berRoas: ber,
      cpc: m.cpc,
      ctr: m.ctr,
      reason,
      lastScale,
      postScale,
    };

    rows.push({
      ...base,
      agentBrief: buildAgentBrief({
        storeName: input.storeName,
        adAccountName,
        platformLabel: base.platformLabel,
        row: base,
        currency,
      }),
    });
  }

  const bucketOrder: CampaignPerformanceBucket[] = [
    "no_conversions",
    "marginal",
    "performing",
  ];

  const sections: CampaignDecisionSection[] = bucketOrder.map((id) => ({
    id,
    ...SECTION_META[id],
    rows: rows
      .filter((r) => r.bucket === id)
      .sort((a, b) => {
        if (a.hasFullWindow !== b.hasFullWindow) {
          return a.hasFullWindow ? -1 : 1;
        }
        if (a.bucket === "no_conversions") return b.spend - a.spend;
        return (b.roasValue ?? 0) - (a.roasValue ?? 0);
      }),
  }));

  const agentLines: string[] = [
    `Análise de campanhas — ${input.storeName}`,
    `Janela: ${input.windowDays} dias com gasto (dados completos)`,
    input.storeBer != null
      ? `BER loja: ${fmtRoas(input.storeBer)}`
      : "BER loja: indisponível (COGS incompleto)",
    "",
  ];

  for (const section of sections) {
    if (!section.rows.length) continue;
    agentLines.push(`## ${section.title}`);
    for (const row of section.rows) {
      agentLines.push("");
      agentLines.push(row.agentBrief);
    }
    agentLines.push("");
  }

  return {
    windowDays: input.windowDays,
    sections,
    agentExport: agentLines.join("\n").trim(),
    storeBerRoas:
      input.storeBer != null
        ? input.storeBer.toFixed(2).replace(".", ",")
        : null,
    campaignCount: rows.length,
  };
}

export { metricsFromSpendDays } from "@/lib/campaign-analysis-core";
