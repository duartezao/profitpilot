/** Catálogo de métricas do painel — ids estáveis para preferências do utilizador. */

export type MetricCategory =
  | "lucro"
  | "vendas"
  | "custos"
  | "ads"
  | "funil";

export type MetricDefinition = {
  id: string;
  label: string;
  category: MetricCategory;
  description: string;
};

export const METRIC_CATEGORY_LABEL: Record<MetricCategory, string> = {
  lucro: "Lucro & margem",
  vendas: "Vendas",
  custos: "Custos",
  ads: "Anúncios",
  funil: "Funil Shopify",
};

export const METRIC_CATALOG: MetricDefinition[] = [
  {
    id: "revenue",
    label: "Revenue",
    category: "vendas",
    description: "Vendas líquidas no período",
  },
  {
    id: "net_profit",
    label: "Net Profit",
    category: "lucro",
    description: "Lucro real após todos os custos",
  },
  {
    id: "margin_pct",
    label: "Margem %",
    category: "lucro",
    description: "Margem líquida sobre a receita",
  },
  {
    id: "contribution_margin",
    label: "Margem contrib. %",
    category: "lucro",
    description: "Margem antes do ad spend",
  },
  {
    id: "roas",
    label: "ROAS",
    category: "ads",
    description: "Receita / ad spend",
  },
  {
    id: "ber",
    label: "BER",
    category: "ads",
    description: "Break-even ROAS mínimo",
  },
  {
    id: "mer",
    label: "MER",
    category: "ads",
    description: "Marketing Efficiency Ratio",
  },
  {
    id: "poas",
    label: "POAS",
    category: "ads",
    description: "Lucro / ad spend",
  },
  {
    id: "ad_spend",
    label: "Ad Spend",
    category: "ads",
    description: "Gasto em anúncios",
  },
  {
    id: "cogs",
    label: "COGS",
    category: "custos",
    description: "Custo dos produtos vendidos",
  },
  {
    id: "shipping",
    label: "Envio",
    category: "custos",
    description: "Custos de envio",
  },
  {
    id: "fees",
    label: "Taxas",
    category: "custos",
    description: "Taxas de pagamento",
  },
  {
    id: "refunds",
    label: "Refunds",
    category: "vendas",
    description: "Reembolsos (informativo)",
  },
  {
    id: "orders",
    label: "Encomendas",
    category: "vendas",
    description: "Número de encomendas",
  },
  {
    id: "aov",
    label: "AOV",
    category: "vendas",
    description: "Valor médio por encomenda",
  },
  {
    id: "cpc",
    label: "CPC",
    category: "ads",
    description: "Custo por clique (contas ads ligadas)",
  },
  {
    id: "ctr_pct",
    label: "CTR %",
    category: "ads",
    description: "Taxa de cliques nas campanhas",
  },
  {
    id: "cpm",
    label: "CPM",
    category: "ads",
    description: "Custo por mil impressões",
  },
  {
    id: "operating_expenses",
    label: "Despesas",
    category: "custos",
    description: "Despesas fixas e subscrições do período",
  },
  {
    id: "sessions",
    label: "Sessões",
    category: "funil",
    description: "Sessões Shopify no país configurado",
  },
  {
    id: "atc_pct",
    label: "ATC %",
    category: "funil",
    description: "Add to cart rate",
  },
  {
    id: "checkout_pct",
    label: "Checkout %",
    category: "funil",
    description: "Reached checkout rate",
  },
  {
    id: "cvr_pct",
    label: "CVR %",
    category: "funil",
    description: "Taxa de conversão",
  },
];

const LABEL_TO_ID = new Map(METRIC_CATALOG.map((m) => [m.label, m.id]));
const ID_TO_METRIC = new Map(METRIC_CATALOG.map((m) => [m.id, m]));

export const ALL_METRIC_IDS = METRIC_CATALOG.map((m) => m.id);

export type MetricPanelPresetId =
  | "completo"
  | "dropshipping"
  | "lucro"
  | "funil"
  | "ads";

export type MetricPanelPreset = {
  id: MetricPanelPresetId;
  name: string;
  description: string;
  metricIds: string[];
};

export const METRIC_PANEL_PRESETS: MetricPanelPreset[] = [
  {
    id: "completo",
    name: "Completo",
    description: "Todas as métricas disponíveis",
    metricIds: [...ALL_METRIC_IDS],
  },
  {
    id: "dropshipping",
    name: "Dropshipping",
    description: "Lucro, ROAS, BER e custos essenciais",
    metricIds: [
      "revenue",
      "net_profit",
      "margin_pct",
      "roas",
      "ber",
      "poas",
      "ad_spend",
      "cogs",
      "contribution_margin",
      "orders",
      "aov",
    ],
  },
  {
    id: "lucro",
    name: "Lucro & margem",
    description: "Foco no que sobra depois dos custos",
    metricIds: [
      "net_profit",
      "margin_pct",
      "contribution_margin",
      "revenue",
      "cogs",
      "shipping",
      "fees",
      "refunds",
      "ad_spend",
    ],
  },
  {
    id: "funil",
    name: "Funil & conversão",
    description: "Sessões e taxas de conversão Shopify",
    metricIds: [
      "net_profit",
      "revenue",
      "orders",
      "sessions",
      "atc_pct",
      "checkout_pct",
      "cvr_pct",
      "aov",
    ],
  },
  {
    id: "ads",
    name: "Ads & escala",
    description: "Eficiência de anúncios e escala",
    metricIds: [
      "net_profit",
      "roas",
      "ber",
      "mer",
      "poas",
      "ad_spend",
      "revenue",
      "margin_pct",
    ],
  },
];

export type MetricPanelPreferences = {
  presetId: MetricPanelPresetId | "custom";
  /** Métricas visíveis, por ordem de exibição no painel. */
  orderedIds: string[];
};

export const DEFAULT_METRIC_PANEL: MetricPanelPreferences = {
  presetId: "dropshipping",
  orderedIds: METRIC_PANEL_PRESETS.find((p) => p.id === "dropshipping")!
    .metricIds,
};

/** @deprecated usar orderedIds */
export type LegacyMetricPanelPreferences = MetricPanelPreferences & {
  visibleIds?: string[];
};

export function metricIdFromLabel(label: string): string {
  return LABEL_TO_ID.get(label) ?? label.toLowerCase().replace(/\s+/g, "_");
}

export function metricDefinition(id: string): MetricDefinition | undefined {
  return ID_TO_METRIC.get(id);
}

export function normalizeMetricPanelPreferences(
  raw: Partial<LegacyMetricPanelPreferences> | null | undefined,
): MetricPanelPreferences {
  const orderedSource = raw?.orderedIds ?? raw?.visibleIds;
  if (!orderedSource?.length) return { ...DEFAULT_METRIC_PANEL };

  const seen = new Set<string>();
  const orderedIds: string[] = [];
  for (const id of orderedSource) {
    if (!ID_TO_METRIC.has(id) || seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
  }
  if (!orderedIds.length) return { ...DEFAULT_METRIC_PANEL };

  const presetId =
    raw?.presetId &&
    (raw.presetId === "custom" ||
      METRIC_PANEL_PRESETS.some((p) => p.id === raw.presetId))
      ? raw.presetId
      : "custom";

  return { presetId, orderedIds };
}

export function preferencesMatchPreset(
  prefs: MetricPanelPreferences,
): MetricPanelPresetId | "custom" {
  const sorted = [...prefs.orderedIds].sort().join(",");
  for (const preset of METRIC_PANEL_PRESETS) {
    if ([...preset.metricIds].sort().join(",") === sorted) {
      return preset.id;
    }
  }
  return "custom";
}

/** Junta KPIs principais e extendidos sem duplicar (principais têm prioridade). */
export function combineKpisForPanel<T extends { label: string }>(
  primary: T[],
  extended: T[] = [],
): T[] {
  const byId = new Map<string, T>();
  for (const k of primary) {
    byId.set(metricIdFromLabel(k.label), k);
  }
  for (const k of extended) {
    const id = metricIdFromLabel(k.label);
    if (!byId.has(id)) byId.set(id, k);
  }
  return Array.from(byId.values());
}

/** Ordena KPIs conforme o painel. Com `strict`, só devolve métricas seleccionadas. */
export function orderKpisForPanel<T extends { label: string }>(
  kpis: T[],
  orderedIds: string[],
  options?: { strict?: boolean },
): T[] {
  const byId = new Map(kpis.map((k) => [metricIdFromLabel(k.label), k]));
  const result: T[] = [];
  const used = new Set<string>();
  for (const id of orderedIds) {
    const k = byId.get(id);
    if (k) {
      result.push(k);
      used.add(id);
    }
  }
  if (!options?.strict) {
    for (const k of kpis) {
      const id = metricIdFromLabel(k.label);
      if (!used.has(id)) result.push(k);
    }
  }
  return result;
}

export function moveMetricInOrder(
  orderedIds: string[],
  metricId: string,
  direction: "up" | "down",
): string[] {
  const idx = orderedIds.indexOf(metricId);
  if (idx < 0) return orderedIds;
  const next = [...orderedIds];
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= next.length) return orderedIds;
  [next[idx], next[swap]] = [next[swap]!, next[idx]!];
  return next;
}

export function storageKeyForMetricPanel(workspaceId: string): string {
  return `pp-metric-panel:${workspaceId}`;
}
