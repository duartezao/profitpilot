import "server-only";
import mongoose from "mongoose";
import { AdCampaignDay } from "@/models/AdCampaignDay";
import { CampaignScaleEvent } from "@/models/CampaignScaleEvent";
import type { AdPlatform } from "@/lib/ad-spend-platforms";
import { AD_PLATFORM_LABELS } from "@/lib/ad-spend-platforms";
import { roasFromCampaign, isPausedCampaignStatus } from "@/lib/ad-campaign-types";
import { formatDateInput } from "@/lib/period";
import {
  metricsFromSpendDays,
  roasChangeVerdict,
  classifyDecisionViewSection,
  pauseCauseForRow,
  buildMediaBuyerPauseCopyMessage,
  buildContiguousSpendWindow,
  isRoasClearlyBelowBer,
  PERFORMING_ROAS_BUFFER,
  type CampaignAnalysisWindow,
  type CampaignDecisionStatus,
  type CampaignPerformanceBucket,
  type SpendDayRow,
} from "@/lib/campaign-analysis-core";
import type {
  CampaignDecisionAnalysis,
  CampaignDecisionRow,
  CampaignDecisionSection,
  CampaignDecisionViewSection,
  CampaignPostPauseAccountSnapshot,
  CampaignPostScaleSnapshot,
  CampaignPauseSnapshot,
  CampaignScaleSnapshot,
} from "@/lib/campaign-analysis-core-types";
import { loadLatestPauseMap } from "@/lib/campaign-pause";

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

const SCALE_BUFFER = PERFORMING_ROAS_BUFFER;

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
  return "marginal";
}

function decideStatus(
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
        reason: `ROAS ${fmtRoas(roas)} claramente abaixo do BER (${fmtRoas(ber)}) — prejuízo consistente.`,
      };
    }
    return {
      status: "maintain",
      reason: `ROAS ${fmtRoas(roas)} perto do BER (${fmtRoas(ber)}) — ainda aceitável, pode melhorar.`,
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
    `Janela: últimos ${row.spendDays}/${row.spendDaysRequired} dias consecutivos com gasto`,
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

  for (const series of byKey.values()) {
    series.spendDays.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }

  return [...byKey.values()];
}

/** Estado mais recente por campanha (último dia na BD). */
async function loadLatestCampaignStatusMap(
  storeId: string,
  adAccountIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!adAccountIds.length) return out;

  const storeOid = new mongoose.Types.ObjectId(storeId);
  const accountOids = adAccountIds.map((id) => new mongoose.Types.ObjectId(id));

  const rows = await AdCampaignDay.aggregate([
    {
      $match: {
        storeId: storeOid,
        adAccountId: { $in: accountOids },
      },
    },
    { $sort: { dateKey: -1 } },
    {
      $group: {
        _id: {
          platform: "$platform",
          adAccountId: "$adAccountId",
          campaignId: "$campaignId",
        },
        status: { $first: "$status" },
      },
    },
  ]);

  for (const r of rows) {
    const key = `${r._id.platform}:${String(r._id.adAccountId)}:${r._id.campaignId}`;
    out.set(key, (r.status as string) ?? "");
  }

  return out;
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
  const verdict = roasChangeVerdict(scale.preRoas, m.roas, after.length);
  return {
    spendDays: after.length,
    spend: m.spend,
    conversions: m.conversions,
    roas: m.roas,
    verdict,
  };
}

const VIEW_SECTION_META: Record<
  CampaignDecisionViewSection,
  { title: string; description: string }
> = {
  pause: {
    title: "Pausar — enviar ao media buyer",
    description:
      "Sem vendas ou ROAS abaixo do break-even (BER) com janela completa. Copia a mensagem em inglês.",
  },
  testing: {
    title: "Em teste",
    description:
      "Ainda a acumular dias consecutivos com gasto, ou o ciclo foi interrompido (sem spend recente).",
  },
  performing: {
    title: "A performar",
    description: "ROAS acima do BER — candidatas a aumentar budget.",
  },
  watch: {
    title: "Perto do break-even",
    description:
      "ROAS no BER ou ligeiramente abaixo — ainda aceitável, pode melhorar antes de pausar.",
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

  const [seriesList, scaleMap, pauseMap, statusMap] = await Promise.all([
    loadCampaignSpendSeries(input.storeId, accountIds, input.windowDays + 7),
    loadLatestScaleEvents(input.storeId, accountIds),
    loadLatestPauseMap(input.storeId, accountIds),
    loadLatestCampaignStatusMap(input.storeId, accountIds),
  ]);

  const referenceDateKey = formatDateInput(new Date());
  const rows: CampaignDecisionRow[] = [];

  for (const series of seriesList) {
    const seriesKey = `${series.platform}:${series.adAccountId}:${series.campaignId}`;
    if (isPausedCampaignStatus(statusMap.get(seriesKey) ?? "")) continue;
    const spendWindow = buildContiguousSpendWindow(
      series.spendDays,
      input.windowDays,
      referenceDateKey,
    );
    const windowDays = spendWindow.windowDays;
    const spendDays = spendWindow.spendDayCount;
    const hasFullWindow = spendWindow.hasFullWindow;
    const staleSpend = spendWindow.staleSpend;
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
      {
        staleSpend,
        lastSpendDateKey: spendWindow.lastSpendDateKey,
      },
    );

    const scaleKey = `${series.platform}:${series.adAccountId}:${series.campaignId}`;
    const lastScale = scaleMap.get(scaleKey);
    const postScale = lastScale
      ? postScaleMetrics(lastScale, series.spendDays)
      : undefined;

    const pauseEntry = pauseMap.get(scaleKey);
    const lastPause: CampaignPauseSnapshot | undefined = pauseEntry
      ? {
          dateKey: pauseEntry.dateKey,
          preSpendDays: pauseEntry.preSpendDays,
          preSpend: pauseEntry.preSpend,
          preConversions: pauseEntry.preConversions,
          preRoas: pauseEntry.preRoas,
          preAccountRoas: pauseEntry.preAccountRoas,
        }
      : undefined;
    const postPauseAccount: CampaignPostPauseAccountSnapshot | undefined =
      pauseEntry?.postPause
        ? {
            accountSpendDays: pauseEntry.postPause.accountSpendDays,
            accountSpend: pauseEntry.postPause.accountSpend,
            accountConversions: pauseEntry.postPause.accountConversions,
            accountRoas: pauseEntry.postPause.accountRoas,
            campaignSpend: pauseEntry.postPause.campaignSpend,
            verdict: pauseEntry.postPause.verdict,
          }
        : undefined;

    const viewSection = classifyDecisionViewSection({
      hasFullWindow,
      conversions: m.conversions,
      roasValue: m.roas,
      berRoas: ber,
      bucket,
    });
    const pauseCause = pauseCauseForRow({
      hasFullWindow,
      conversions: m.conversions,
      roasValue: m.roas,
      berRoas: ber,
    });

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
      staleSpend: staleSpend || undefined,
      spend: m.spend,
      conversions: m.conversions,
      conversionValue: m.conversionValue,
      roas: fmtRoas(m.roas),
      roasValue: m.roas,
      berRoas: ber,
      cpc: m.cpc,
      ctr: m.ctr,
      reason,
      viewSection,
      pauseCause,
      lastScale,
      postScale,
      lastPause,
      postPauseAccount,
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

  const viewOrder: CampaignDecisionViewSection[] = [
    "pause",
    "testing",
    "performing",
    "watch",
  ];

  const sections: CampaignDecisionSection[] = viewOrder.map((id) => ({
    id,
    ...VIEW_SECTION_META[id],
    rows: rows
      .filter((r) => r.viewSection === id)
      .sort((a, b) => {
        if (id === "pause") {
          const causeOrder = { no_sales: 0, below_ber: 1 };
          const ca = a.pauseCause ? causeOrder[a.pauseCause] : 2;
          const cb = b.pauseCause ? causeOrder[b.pauseCause] : 2;
          if (ca !== cb) return ca - cb;
          if (a.pauseCause === "below_ber" && b.pauseCause === "below_ber") {
            return (a.roasValue ?? 0) - (b.roasValue ?? 0);
          }
          return b.spend - a.spend;
        }
        if (id === "testing") return b.spend - a.spend;
        if (id === "performing") return (b.roasValue ?? 0) - (a.roasValue ?? 0);
        return (a.roasValue ?? 0) - (b.roasValue ?? 0);
      }),
  }));

  const pauseRows = rows.filter((r) => r.viewSection === "pause");
  const mediaBuyerPauseMessage = buildMediaBuyerPauseCopyMessage(
    pauseRows,
    input.windowDays,
  );

  const agentLines: string[] = [
    `Campaign analysis — ${input.storeName}`,
    `Window: ${input.windowDays} days with spend`,
    input.storeBer != null
      ? `Store BER: ${input.storeBer.toFixed(2)}x`
      : "Store BER: unavailable",
    "",
  ];

  if (mediaBuyerPauseMessage) {
    agentLines.push("## Pause — send to media buyer");
    agentLines.push("");
    agentLines.push(mediaBuyerPauseMessage);
    agentLines.push("");
  }

  for (const section of sections) {
    if (section.id === "pause" || !section.rows.length) continue;
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
    mediaBuyerPauseMessage,
    agentExport: agentLines.join("\n").trim(),
    storeBerRoas:
      input.storeBer != null
        ? input.storeBer.toFixed(2).replace(".", ",")
        : null,
    campaignCount: rows.length,
  };
}

export { metricsFromSpendDays } from "@/lib/campaign-analysis-core";
