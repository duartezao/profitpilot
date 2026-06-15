import "server-only";
import { berRoas } from "@/lib/profit";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  buildWorkspacePnl,
  buildWorkspaceSummary,
  type TopProduct,
} from "@/lib/metrics";
import { buildWorkspaceTreasury, type WorkspaceTreasury } from "@/lib/treasury";
import type { PeriodInput } from "@/lib/period";

export type DecisionStatus = "scale" | "maintain" | "kill";

export type DecisionRow = {
  name: string;
  kind: "product" | "store";
  status: DecisionStatus;
  statusLabel: string;
  roas: string;
  ber: string;
  margin: string;
  spend: string;
};

export type TodayAction = {
  level: "positive" | "warning" | "negative";
  text: string;
};

export type DecisionSummary = {
  scopeName: string | null;
  periodLabel: string;
  actions: TodayAction[];
  rows: DecisionRow[];
  treasury: {
    available: string;
    incoming: string;
    payable: string;
    projected: string;
    projectedTitle: string;
    currency: string;
  } | null;
  generatedAt: string;
};

function statusLabel(status: DecisionStatus): string {
  if (status === "scale") return "Scale";
  if (status === "kill") return "Kill";
  return "Manter";
}

function productStatus(marginPct: number, positive: boolean): DecisionStatus {
  if (!positive || marginPct < 0) return "kill";
  if (marginPct >= 15 && positive) return "scale";
  return "maintain";
}

function storeStatus(
  margin: number,
  netProfit: number,
  roas: number | null,
  ber: number | null,
): DecisionStatus {
  if (netProfit < 0 || margin < 0) return "kill";
  if (roas != null && ber != null && roas >= ber * 1.1 && margin >= 10) return "scale";
  return "maintain";
}

function parseMarginPct(margin: string): number {
  const n = Number.parseFloat(margin.replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function buildProductRows(products: TopProduct[]): DecisionRow[] {
  return products.map((p) => {
    const marginPct = parseMarginPct(p.margin);
    const status = productStatus(marginPct, p.positive);
    return {
      name: p.title,
      kind: "product",
      status,
      statusLabel: statusLabel(status),
      roas: "—",
      ber: "—",
      margin: p.margin,
      spend: "—",
    };
  });
}

function buildStoreRows(
  currency: string,
  stores: Awaited<ReturnType<typeof buildWorkspacePnl>>["stores"],
  adSpendByStore: Map<string, number>,
): DecisionRow[] {
  return stores.map((s) => {
    const ber = berRoas(s);
    const roas = s.adSpend > 0 ? s.revenue / s.adSpend : null;
    const status = storeStatus(s.margin, s.netProfit, roas, ber);
    return {
      name: s.name,
      kind: "store",
      status,
      statusLabel: statusLabel(status),
      roas: roas != null ? roas.toFixed(2).replace(".", ",") : "—",
      ber: ber != null ? ber.toFixed(2).replace(".", ",") : "—",
      margin: formatPercent(s.margin),
      spend: formatCurrency(s.adSpend, currency),
    };
  });
}

function buildTodayActions(input: {
  rows: DecisionRow[];
  treasury: WorkspaceTreasury | null;
  storeId?: string;
  missingAdSpendDays: number;
  cogsIncomplete: boolean;
}): TodayAction[] {
  const actions: TodayAction[] = [];

  const scaleRows = input.rows.filter((r) => r.status === "scale");
  if (scaleRows[0]) {
    actions.push({
      level: "positive",
      text: `${scaleRows[0].name} com margem saudável — considera escalar.`,
    });
  }

  const killRows = input.rows.filter((r) => r.status === "kill");
  if (killRows[0]) {
    actions.push({
      level: "negative",
      text: `${killRows[0].name} em prejuízo — rever preço, COGS ou pausar ads.`,
    });
  }

  if (input.missingAdSpendDays > 0) {
    actions.push({
      level: "warning",
      text: `Ad spend em falta em ${input.missingAdSpendDays} dia(s) — preenche em Anúncios para decisões fiáveis.`,
    });
  }

  if (input.cogsIncomplete) {
    actions.push({
      level: "warning",
      text: "COGS incompleto — o lucro e o BER podem estar distorcidos.",
    });
  }

  const projected = input.storeId
    ? input.treasury?.stores.find((s) => s.storeId === input.storeId)?.projected
    : input.treasury?.totals.projected;

  if (projected != null && projected < 0) {
    actions.push({
      level: "negative",
      text: "Tesouraria apertada — evita aumentar budget até entrar payout.",
    });
  } else if (
    input.treasury &&
    (input.storeId
      ? input.treasury.stores.find((s) => s.storeId === input.storeId)?.available
      : input.treasury.totals.available) === 0 &&
    input.treasury.totals.incoming > 0
  ) {
    actions.push({
      level: "warning",
      text: "Saldo disponível baixo face ao que está a caminho — confirma tesouraria.",
    });
  }

  if (actions.length === 0) {
    actions.push({
      level: "positive",
      text: "Sem alertas críticos — mantém o ritmo e monitoriza o BER.",
    });
  }

  return actions.slice(0, 3);
}

function treasuryCard(
  treasury: WorkspaceTreasury,
  storeId?: string,
): DecisionSummary["treasury"] {
  const line = storeId
    ? treasury.stores.find((s) => s.storeId === storeId)
    : null;
  const view = line ?? treasury.totals;

  return {
    available: line?.availableFmt ?? treasury.totals.availableFmt,
    incoming: line?.incomingFmt ?? treasury.totals.incomingFmt,
    payable: line?.receivedFmt ?? treasury.totals.receivedFmt,
    projected: line?.projectedFmt ?? treasury.totals.projectedFmt,
    projectedTitle: line?.projectedTitle ?? treasury.totals.projectedTitle,
    currency: treasury.currency,
  };
}

export async function buildDecisionSummary(
  workspaceId: string,
  storeId?: string,
  periodInput?: PeriodInput,
): Promise<DecisionSummary> {
  const [summary, pnl, treasury] = await Promise.all([
    buildWorkspaceSummary(workspaceId, storeId, periodInput),
    buildWorkspacePnl(workspaceId, periodInput, storeId),
    buildWorkspaceTreasury(workspaceId, storeId).catch(() => null),
  ]);

  let rows: DecisionRow[];
  if (storeId && summary.topProducts.length > 0) {
    rows = buildProductRows(summary.topProducts);
  } else {
    const adMap = new Map(pnl.stores.map((s) => [s.name, s.adSpend]));
    rows = buildStoreRows(pnl.currency, pnl.stores, adMap);
  }

  rows.sort((a, b) => {
    const order: Record<DecisionStatus, number> = { kill: 0, maintain: 1, scale: 2 };
    return order[a.status] - order[b.status];
  });

  const actions = buildTodayActions({
    rows,
    treasury,
    storeId,
    missingAdSpendDays: summary.missingAdSpendDays,
    cogsIncomplete: summary.cogsIncomplete,
  });

  return {
    scopeName: summary.scopeName,
    periodLabel: summary.storeDashboard?.periodLabel ?? pnl.periodLabel,
    actions,
    rows,
    treasury: treasury ? treasuryCard(treasury, storeId) : null,
    generatedAt: new Date().toISOString(),
  };
}
