import "server-only";
import { formatCurrency } from "@/lib/utils";
import { buildWorkspaceSummary } from "@/lib/metrics";
import type { StoreAccess } from "@/lib/store-access";
import {
  dateKeyFromDate,
  reminderUrgency,
  DEFAULT_COLLECTION_REMINDER_DAYS_BEFORE,
} from "@/lib/collection-schedule";
import { formatDateInput, startOfDay } from "@/lib/period";

export type CollectionDecisionHint = {
  collectionId: string;
  collectionName: string;
  storeId: string;
  storeName: string;
  testEndsLabel: string | null;
  suggestedStatus: "winner" | "failed" | "review";
  suggestedLabel: string;
  reason: string;
  profit: number;
  profitFmt: string;
  revenue: number;
  revenueFmt: string;
  roas: number | null;
  roasFmt: string;
  cogsIncomplete: boolean;
};

function parseMoneyKpi(value: string): number {
  const s = value.replace(/[^\d,.-]/g, "").trim();
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (s.includes(",")) return parseFloat(s.replace(",", ".")) || 0;
  return parseFloat(s) || 0;
}

export async function buildCollectionDecisionHint(opts: {
  workspaceId: string;
  storeId: string;
  storeName: string;
  collectionId: string;
  collectionName: string;
  testStartedAt: Date;
  testEndsAt: Date;
  reminderDaysBefore?: number;
  storeAccess: StoreAccess;
}): Promise<CollectionDecisionHint | null> {
  const startKey = dateKeyFromDate(opts.testStartedAt);
  const endsKey = dateKeyFromDate(opts.testEndsAt);
  const todayKey = formatDateInput(startOfDay(new Date()));
  const reminderBefore =
    opts.reminderDaysBefore ?? DEFAULT_COLLECTION_REMINDER_DAYS_BEFORE;

  const urg = reminderUrgency(endsKey, todayKey, reminderBefore);
  if (todayKey < endsKey && !urg) return null;

  const summary = await buildWorkspaceSummary(
    opts.workspaceId,
    opts.storeId,
    { from: startKey, to: endsKey },
    opts.storeAccess,
  );

  const profit = summary.profitChart.reduce((s, p) => s + p.profit, 0);
  const revenue = summary.dailyMetrics.reduce(
    (s, row) => s + parseMoneyKpi(row.revenue),
    0,
  );

  let adSpend = 0;
  for (const row of summary.dailyMetrics) {
    adSpend += parseMoneyKpi(row.adSpend);
  }

  const roas = adSpend > 0 ? revenue / adSpend : null;
  const fmtMoney = (n: number) => formatCurrency(n, "EUR");

  let suggestedStatus: CollectionDecisionHint["suggestedStatus"] = "review";
  let suggestedLabel = "Avaliar";
  let reason = "Dados do ciclo sem sinal claro — confirma manualmente.";

  if (summary.cogsIncomplete) {
    reason = "COGS em falta no período — completa custos antes de decidir.";
  } else if (profit > 0 && roas != null && roas >= 1.5) {
    suggestedStatus = "winner";
    suggestedLabel = "Performou";
    reason = `Lucro positivo (${fmtMoney(profit)}) e ROAS ${roas.toFixed(2).replace(".", ",")} no ciclo.`;
  } else if (profit < 0) {
    suggestedStatus = "failed";
    suggestedLabel = "Matada";
    reason = `Prejuízo de ${fmtMoney(Math.abs(profit))} no ciclo de teste.`;
  } else if (roas != null && roas < 0.8) {
    suggestedStatus = "failed";
    suggestedLabel = "Matada";
    reason = `ROAS baixo (${roas.toFixed(2).replace(".", ",")}) no ciclo.`;
  } else if (profit > 0) {
    suggestedStatus = "review";
    suggestedLabel = "Avaliar";
    reason = `Lucro positivo mas ROAS modesto — confirma se vale escalar.`;
  }

  const endsDate = opts.testEndsAt;
  const testEndsLabel = endsDate.toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
  });

  return {
    collectionId: opts.collectionId,
    collectionName: opts.collectionName,
    storeId: opts.storeId,
    storeName: opts.storeName,
    testEndsLabel,
    suggestedStatus,
    suggestedLabel,
    reason,
    profit,
    profitFmt: fmtMoney(profit),
    revenue,
    revenueFmt: fmtMoney(revenue),
    roas,
    roasFmt: roas != null ? roas.toFixed(2).replace(".", ",") : "—",
    cogsIncomplete: summary.cogsIncomplete,
  };
}
