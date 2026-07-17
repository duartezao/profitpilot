/**
 * Meta Marketing API — Ads Insights & ad accounts.
 * @see https://developers.facebook.com/docs/marketing-api/insights
 * @see https://developers.facebook.com/docs/marketing-api/reference/ad-account
 *
 * Permissão necessária: `ads_read` (token de utilizador ou System User do Business Manager).
 */

import {
  formatCampaignStatusLabel,
  isActiveCampaignStatus,
  isPausedCampaignStatus,
  metricsFromCampaignTotals,
  roasFromCampaign,
  shouldIncludeCampaignForDay,
  type LiveCampaignRow,
} from "@/lib/ad-campaign-types";

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v25.0";
const META_GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type MetaAdAccountOption = {
  /** ID Graph API (ex. act_123456789) */
  id: string;
  accountId: string;
  name: string;
  currency: string;
  accountStatus: number;
};

type MetaErrorBody = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export class MetaApiError extends Error {
  readonly code?: number;
  readonly subcode?: number;

  constructor(error: MetaErrorBody) {
    super(formatMetaErrorMessage(error));
    this.name = "MetaApiError";
    this.code = error.code;
    this.subcode = error.error_subcode;
  }
}

function formatMetaErrorMessage(error: MetaErrorBody): string {
  const base = error.message ?? "Erro da Meta Marketing API";
  switch (error.code) {
    case 190:
      return `Token inválido ou expirado — gera um novo no Business Manager (System User com ads_read). Detalhe: ${base}`;
    case 200:
      return `Sem permissão nesta ad account — confirma ads_read e que o System User tem acesso à conta. Detalhe: ${base}`;
    case 100:
      return `Pedido inválido — verifica o ID da conta (act_…). Detalhe: ${base}`;
    case 17:
      return `Limite de pedidos da Meta API — tenta de novo dentro de alguns minutos.`;
    default:
      return base;
  }
}

export function normalizeActId(id: string): string {
  const t = id.trim();
  if (t.startsWith("act_")) return t;
  const digits = t.replace(/\D/g, "");
  if (!digits) throw new MetaApiError({ message: "ID de ad account inválido.", code: 100 });
  return `act_${digits}`;
}

async function metaGraphGet<T>(
  pathOrUrl: string,
  accessToken: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = pathOrUrl.startsWith("http")
    ? new URL(pathOrUrl)
    : new URL(`${META_GRAPH}/${pathOrUrl.replace(/^\//, "")}`);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const json = (await res.json()) as T & { error?: MetaErrorBody };
  if (!res.ok || json.error) {
    throw new MetaApiError(json.error ?? { message: `HTTP ${res.status}` });
  }
  return json;
}

/** Lista ad accounts acessíveis com o token (diretas + Business Manager). */
export async function listMetaAdAccounts(
  accessToken: string,
): Promise<MetaAdAccountOption[]> {
  type AdAccountRow = {
    id: string;
    account_id: string;
    name?: string;
    account_status?: number;
    currency?: string;
  };
  type AdAccountPage = {
    data?: AdAccountRow[];
    paging?: { next?: string };
  };

  const byId = new Map<string, MetaAdAccountOption>();

  const addRow = (row: AdAccountRow) => {
    const id = row.id.startsWith("act_") ? row.id : `act_${row.account_id}`;
    if (byId.has(id)) return;
    byId.set(id, {
      id,
      accountId: row.account_id,
      name: row.name?.trim() || `Conta ${row.account_id}`,
      currency: row.currency ?? "USD",
      accountStatus: row.account_status ?? 0,
    });
  };

  const fetchAdAccountEdge = async (pathOrUrl: string, params?: Record<string, string>) => {
    let nextUrl: string | null = null;
    let first = true;
    while (first || nextUrl) {
      first = false;
      try {
        const json: AdAccountPage = nextUrl
          ? await metaGraphGet<AdAccountPage>(nextUrl, accessToken)
          : await metaGraphGet<AdAccountPage>(pathOrUrl, accessToken, {
              fields: "account_id,name,account_status,currency,id",
              limit: "100",
              ...params,
            });
        for (const row of json.data ?? []) addRow(row);
        nextUrl = json.paging?.next ?? null;
      } catch {
        nextUrl = null;
      }
    }
  };

  await fetchAdAccountEdge("me/adaccounts");

  try {
    const me = await metaGraphGet<{ id?: string }>("me", accessToken, {
      fields: "id",
    });
    if (me.id) {
      await fetchAdAccountEdge(`${me.id}/adaccounts`);
    }
  } catch {
    /* fallback */
  }

  type BusinessPage = {
    data?: Array<{
      id: string;
      owned_ad_accounts?: { data?: AdAccountRow[] };
      client_ad_accounts?: { data?: AdAccountRow[] };
    }>;
    paging?: { next?: string };
  };

  let bizUrl: string | null = null;
  let bizFirst = true;
  while (bizFirst || bizUrl) {
    bizFirst = false;
    try {
      const bizJson: BusinessPage = bizUrl
        ? await metaGraphGet<BusinessPage>(bizUrl, accessToken)
        : await metaGraphGet<BusinessPage>("me/businesses", accessToken, {
            fields:
              "id,owned_ad_accounts{account_id,name,account_status,currency,id},client_ad_accounts{account_id,name,account_status,currency,id}",
            limit: "50",
          });
      for (const biz of bizJson.data ?? []) {
        for (const row of biz.owned_ad_accounts?.data ?? []) addRow(row);
        for (const row of biz.client_ad_accounts?.data ?? []) addRow(row);
        try {
          await fetchAdAccountEdge(`${biz.id}/owned_ad_accounts`);
        } catch {
          /* sem acesso */
        }
        try {
          await fetchAdAccountEdge(`${biz.id}/client_ad_accounts`);
        } catch {
          /* sem acesso */
        }
        try {
          await fetchAdAccountEdge(`${biz.id}/ad_accounts`);
        } catch {
          /* edge alternativo */
        }
        try {
          await fetchAdAccountEdge(`${biz.id}/shared_ad_accounts`);
        } catch {
          /* partilhadas */
        }
        try {
          await fetchAdAccountEdge(`${biz.id}/assigned_ad_accounts`);
        } catch {
          /* atribuídas */
        }
      }
      bizUrl = bizJson.paging?.next ?? null;
    } catch {
      bizUrl = null;
    }
  }

  const accounts = [...byId.values()];
  if (!accounts.length) {
    throw new MetaApiError({
      message:
        "Nenhuma ad account encontrada. Confirma ads_read, que o convite foi aceite no Business Manager, e que o login Meta é o mesmo que recebeu o acesso.",
      code: 200,
    });
  }

  return accounts.sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

/** Confirma que o token consegue ler a ad account antes de guardar. */
export async function verifyMetaAdAccountAccess(
  accessToken: string,
  adAccountId: string,
): Promise<{ name: string; currency: string; accountStatus: number }> {
  const actId = normalizeActId(adAccountId);
  const json = await metaGraphGet<{
    name?: string;
    currency?: string;
    account_status?: number;
  }>(actId, accessToken, {
    fields: "name,currency,account_status",
  });

  return {
    name: json.name?.trim() || actId,
    currency: json.currency ?? "USD",
    accountStatus: json.account_status ?? 0,
  };
}

/**
 * Gasto da conta num único dia (time_range since=until).
 * Moeda devolvida em account_currency (conversão para base na camada de ad spend).
 */
export async function fetchMetaAdSpendForDay(
  accessToken: string,
  adAccountId: string,
  dateKey: string,
): Promise<{ spend: number; currency: string }> {
  const actId = normalizeActId(adAccountId);
  const json = await metaGraphGet<{
    data?: Array<{ spend?: string; account_currency?: string }>;
  }>(`${actId}/insights`, accessToken, {
    fields: "spend,account_currency",
    time_range: JSON.stringify({ since: dateKey, until: dateKey }),
    level: "account",
    time_increment: "1",
  });

  const row = json.data?.[0];
  const spend = Number(row?.spend ?? 0);
  const currency = row?.account_currency ?? "USD";
  return { spend: Number.isFinite(spend) ? spend : 0, currency };
}

export type MetaAdInsightsDay = {
  spend: number;
  impressions: number;
  clicks: number;
  currency: string;
};

/** Insights da conta num dia (CPC/CTR/CPM quando disponíveis na API). */
export async function fetchMetaAdInsightsForDay(
  accessToken: string,
  adAccountId: string,
  dateKey: string,
): Promise<MetaAdInsightsDay> {
  const actId = normalizeActId(adAccountId);
  const json = await metaGraphGet<{
    data?: Array<{
      spend?: string;
      impressions?: string;
      clicks?: string;
      account_currency?: string;
    }>;
  }>(`${actId}/insights`, accessToken, {
    fields: "spend,impressions,clicks,account_currency",
    time_range: JSON.stringify({ since: dateKey, until: dateKey }),
    level: "account",
    time_increment: "1",
  });

  const row = json.data?.[0];
  return {
    spend: Number(row?.spend ?? 0) || 0,
    impressions: Number(row?.impressions ?? 0) || 0,
    clicks: Number(row?.clicks ?? 0) || 0,
    currency: row?.account_currency ?? "USD",
  };
}

export type CampaignInsightsRow = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  currency: string;
  status?: string;
  statusLabel?: string;
  /** Budget diário em moeda da conta (Meta). */
  dailyBudget?: number | null;
};

const META_PURCHASE_ACTIONS = new Set([
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "web_in_store_purchase",
  "onsite_conversion.purchase",
  "web_app_in_store_purchase",
]);

function isMetaPurchaseAction(actionType: string): boolean {
  const t = actionType.trim().toLowerCase();
  if (!t) return false;
  if (META_PURCHASE_ACTIONS.has(actionType)) return true;
  if (t.endsWith(".purchase") || t.includes("purchase")) return true;
  if (t.includes("fb_pixel_purchase")) return true;
  return false;
}

type MetaInsightsConversions = {
  actions?: Array<{ action_type?: string; value?: string }>;
  action_values?: Array<{ action_type?: string; value?: string }>;
  purchase_roas?: Array<{ action_type?: string; value?: string }>;
};

function metaPurchaseFromInsights(
  row: MetaInsightsConversions,
  spend = 0,
): { conversions: number; conversionValue: number } {
  let conversions = 0;
  let conversionValue = 0;
  for (const a of row.actions ?? []) {
    const t = a.action_type ?? "";
    if (isMetaPurchaseAction(t)) {
      conversions += Number(a.value ?? 0) || 0;
    }
  }
  for (const a of row.action_values ?? []) {
    const t = a.action_type ?? "";
    if (isMetaPurchaseAction(t)) {
      conversionValue += Number(a.value ?? 0) || 0;
    }
  }

  if (conversionValue <= 0 && spend > 0) {
    for (const pr of row.purchase_roas ?? []) {
      const t = pr.action_type ?? "";
      if (!isMetaPurchaseAction(t)) continue;
      const roas = Number(pr.value ?? 0) || 0;
      if (roas > 0) {
        conversionValue = spend * roas;
        break;
      }
    }
  }

  if (conversionValue <= 0 && conversions <= 0 && spend > 0) {
    for (const a of row.actions ?? []) {
      const t = (a.action_type ?? "").toLowerCase();
      if (t.includes("purchase") || t.includes("checkout")) {
        conversions += Number(a.value ?? 0) || 0;
      }
    }
  }

  return { conversions, conversionValue };
}

const META_CAMPAIGN_INSIGHT_FIELDS =
  "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,purchase_roas,account_currency";

type MetaCampaignCatalogEntry = { name: string; status: string; dailyBudget: number | null };

type MetaCampaignDayMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  currency: string;
  name: string;
};

type MetaCampaignPage = {
  data?: Array<{
    id?: string;
    name?: string;
    status?: string;
    effective_status?: string;
  }>;
  paging?: { next?: string };
};

type MetaInsightsPage = {
  data?: Array<{
    campaign_id?: string;
    campaign_name?: string;
    spend?: string;
    impressions?: string;
    clicks?: string;
    account_currency?: string;
    actions?: Array<{ action_type?: string; value?: string }>;
    action_values?: Array<{ action_type?: string; value?: string }>;
    purchase_roas?: Array<{ action_type?: string; value?: string }>;
  }>;
  paging?: { next?: string };
};

async function loadMetaCampaignCatalog(
  accessToken: string,
  actId: string,
): Promise<Map<string, MetaCampaignCatalogEntry>> {
  const campaignsById = new Map<string, MetaCampaignCatalogEntry>();
  let nextUrl: string | null = null;
  let first = true;

  while (first || nextUrl) {
    first = false;
    const json: MetaCampaignPage = nextUrl
      ? await metaGraphGet<MetaCampaignPage>(nextUrl, accessToken)
      : await metaGraphGet<MetaCampaignPage>(`${actId}/campaigns`, accessToken, {
          fields: "id,name,status,effective_status,daily_budget",
          limit: "100",
        });

    for (const c of json.data ?? []) {
      const id = String(c.id ?? "").trim();
      if (!id) continue;
      const rawBudget = (c as { daily_budget?: string }).daily_budget;
      const dailyBudget =
        rawBudget != null && Number(rawBudget) > 0 ? Number(rawBudget) : null;
      campaignsById.set(id, {
        name: c.name?.trim() || "Campanha",
        status: c.effective_status?.trim() || c.status?.trim() || "UNKNOWN",
        dailyBudget,
      });
    }
    nextUrl = json.paging?.next ?? null;
  }

  return campaignsById;
}

async function loadMetaCampaignDayMetrics(
  accessToken: string,
  actId: string,
  dateKey: string,
): Promise<Map<string, MetaCampaignDayMetrics>> {
  const metricsById = new Map<string, MetaCampaignDayMetrics>();
  let nextUrl: string | null = null;
  let first = true;

  while (first || nextUrl) {
    first = false;
    const json: MetaInsightsPage = nextUrl
      ? await metaGraphGet<MetaInsightsPage>(nextUrl, accessToken)
      : await metaGraphGet<MetaInsightsPage>(`${actId}/insights`, accessToken, {
          fields: META_CAMPAIGN_INSIGHT_FIELDS,
          time_range: JSON.stringify({ since: dateKey, until: dateKey }),
          level: "campaign",
          limit: "100",
        });

    for (const row of json.data ?? []) {
      const id = String(row.campaign_id ?? "").trim();
      if (!id) continue;
      const spend = Number(row.spend ?? 0) || 0;
      const { conversions, conversionValue } = metaPurchaseFromInsights(row, spend);
      metricsById.set(id, {
        spend,
        impressions: Number(row.impressions ?? 0) || 0,
        clicks: Number(row.clicks ?? 0) || 0,
        conversions,
        conversionValue,
        currency: row.account_currency ?? "USD",
        name: row.campaign_name?.trim() || "Campanha",
      });
    }
    nextUrl = json.paging?.next ?? null;
  }

  return metricsById;
}

function buildMetaCampaignInsightRows(
  campaignsById: Map<string, MetaCampaignCatalogEntry>,
  metricsById: Map<string, MetaCampaignDayMetrics>,
): CampaignInsightsRow[] {
  const out: CampaignInsightsRow[] = [];
  const seen = new Set<string>();

  for (const [id, c] of campaignsById) {
    if (!isActiveCampaignStatus(c.status) && !isPausedCampaignStatus(c.status)) {
      continue;
    }
    const m = metricsById.get(id);
    if (
      !shouldIncludeCampaignForDay(c.status, {
        spend: m?.spend,
        impressions: m?.impressions,
        clicks: m?.clicks,
        conversions: m?.conversions,
      })
    ) {
      continue;
    }
    out.push({
      campaignId: id,
      campaignName: c.name || m?.name || "Campanha",
      spend: m?.spend ?? 0,
      impressions: m?.impressions ?? 0,
      clicks: m?.clicks ?? 0,
      conversions: m?.conversions ?? 0,
      conversionValue: m?.conversionValue ?? 0,
      currency: m?.currency ?? "USD",
      status: c.status,
      statusLabel: formatCampaignStatusLabel(c.status),
      dailyBudget: c.dailyBudget,
    });
    seen.add(id);
  }

  for (const [id, m] of metricsById) {
    if (seen.has(id)) continue;
    out.push({
      campaignId: id,
      campaignName: m.name,
      spend: m.spend,
      impressions: m.impressions,
      clicks: m.clicks,
      conversions: m.conversions,
      conversionValue: m.conversionValue,
      currency: m.currency,
      status: "ACTIVE",
      statusLabel: "Activa",
    });
  }

  return out;
}

/** Insights por campanha num dia (activas sempre; pausadas só com actividade no dia). */
export async function fetchMetaCampaignInsightsForDay(
  accessToken: string,
  adAccountId: string,
  dateKey: string,
): Promise<CampaignInsightsRow[]> {
  const actId = normalizeActId(adAccountId);
  const [campaignsById, metricsById] = await Promise.all([
    loadMetaCampaignCatalog(accessToken, actId),
    loadMetaCampaignDayMetrics(accessToken, actId, dateKey),
  ]);
  return buildMetaCampaignInsightRows(campaignsById, metricsById);
}

/** Campanhas activas/pausadas com métricas de hoje. */
export async function fetchMetaLiveCampaigns(
  accessToken: string,
  adAccountId: string,
  dateKey: string,
): Promise<LiveCampaignRow[]> {
  const actId = normalizeActId(adAccountId);
  const [campaignsById, metricsById] = await Promise.all([
    loadMetaCampaignCatalog(accessToken, actId),
    loadMetaCampaignDayMetrics(accessToken, actId, dateKey),
  ]);

  const insightRows = buildMetaCampaignInsightRows(campaignsById, metricsById);

  return insightRows
    .map((row) => ({
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      platform: "meta" as const,
      platformLabel: "Meta",
      adAccountId: actId,
      adAccountName: actId,
      status: row.status ?? "ACTIVE",
      statusLabel: row.statusLabel ?? "Activa",
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      conversionValue: row.conversionValue,
      currency: row.currency,
      roas: roasFromCampaign(row.spend, row.conversionValue),
      ...metricsFromCampaignTotals(row.spend, row.impressions, row.clicks),
    }))
    .sort((a, b) => b.spend - a.spend);
}

export type CampaignLandingUrlsRow = {
  campaignId: string;
  campaignName: string;
  landingUrls: string[];
};

type MetaCreativeUrlFields = {
  id?: string;
  link_url?: string | null;
  object_url?: string | null;
  template_url?: string | null;
  call_to_action?: { value?: { link?: string | null } } | null;
  object_story_spec?: {
    link_data?: {
      link?: string | null;
      call_to_action?: { value?: { link?: string | null } } | null;
      child_attachments?: Array<{
        link?: string | null;
        call_to_action?: { value?: { link?: string | null } } | null;
      } | null> | null;
    } | null;
    video_data?: {
      call_to_action?: { value?: { link?: string | null } } | null;
    } | null;
    template_data?: {
      link?: string | null;
      call_to_action?: { value?: { link?: string | null } } | null;
    } | null;
  } | null;
  asset_feed_spec?: {
    link_urls?: Array<{
      website_url?: string | null;
      display_url?: string | null;
      deeplink_url?: string | null;
    } | null> | null;
  } | null;
  effective_object_story_id?: string | null;
  object_story_id?: string | null;
};

const META_CREATIVE_URL_FIELDS =
  "id,link_url,object_url,template_url,call_to_action,object_story_spec,asset_feed_spec,effective_object_story_id,object_story_id";

function pushUrl(out: string[], u?: string | null) {
  if (u && typeof u === "string" && u.trim()) out.push(u.trim());
}

function metaCreativeLandingUrls(
  creative: MetaCreativeUrlFields | null | undefined,
): string[] {
  if (!creative) return [];
  const out: string[] = [];
  pushUrl(out, creative.link_url);
  pushUrl(out, creative.object_url);
  pushUrl(out, creative.template_url);
  pushUrl(out, creative.call_to_action?.value?.link);

  const spec = creative.object_story_spec;
  pushUrl(out, spec?.link_data?.link);
  pushUrl(out, spec?.link_data?.call_to_action?.value?.link);
  for (const child of spec?.link_data?.child_attachments ?? []) {
    pushUrl(out, child?.link);
    pushUrl(out, child?.call_to_action?.value?.link);
  }
  pushUrl(out, spec?.video_data?.call_to_action?.value?.link);
  pushUrl(out, spec?.template_data?.link);
  pushUrl(out, spec?.template_data?.call_to_action?.value?.link);

  for (const lu of creative.asset_feed_spec?.link_urls ?? []) {
    pushUrl(out, lu?.website_url);
    pushUrl(out, lu?.deeplink_url);
  }
  return out;
}

function storyIdFromCreative(
  creative: MetaCreativeUrlFields,
): string | null {
  const raw =
    creative.effective_object_story_id?.trim() ||
    creative.object_story_id?.trim() ||
    "";
  return raw || null;
}

async function metaGraphGetByIds<T extends { id?: string }>(
  ids: string[],
  accessToken: string,
  fields: string,
): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const CHUNK = 40;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const url = new URL(META_GRAPH);
    url.searchParams.set("ids", chunk.join(","));
    url.searchParams.set("fields", fields);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const json = (await res.json()) as Record<
      string,
      T & { error?: MetaErrorBody }
    > & { error?: MetaErrorBody };
    if (!res.ok || json.error) {
      throw new MetaApiError(json.error ?? { message: `HTTP ${res.status}` });
    }
    for (const id of chunk) {
      const row = json[id];
      if (row && !row.error) out.set(id, row);
    }
  }
  return out;
}

type MetaPostLinkFields = {
  id?: string;
  link?: string | null;
  call_to_action?: { value?: { link?: string | null } } | null;
  attachments?: {
    data?: Array<{
      unshimmed_url?: string | null;
      url?: string | null;
      target?: { url?: string | null } | null;
    } | null>;
  } | null;
};

function metaPostLandingUrls(
  post: MetaPostLinkFields | null | undefined,
): string[] {
  if (!post) return [];
  const out: string[] = [];
  pushUrl(out, post.link);
  pushUrl(out, post.call_to_action?.value?.link);
  for (const att of post.attachments?.data ?? []) {
    pushUrl(out, att?.unshimmed_url);
    pushUrl(out, att?.target?.url);
    pushUrl(out, att?.url);
  }
  return out;
}

/**
 * URLs de destino por campanha Meta — todos os ads (paginação completa),
 * creatives hidratados em batch + posts (object_story_id) quando necessário.
 */
export async function fetchMetaCampaignLandingUrls(
  accessToken: string,
  adAccountId: string,
): Promise<CampaignLandingUrlsRow[]> {
  const actId = normalizeActId(adAccountId);

  type AdRow = {
    campaign_id?: string;
    campaign?: { id?: string; name?: string };
    name?: string;
    creative?: { id?: string } | MetaCreativeUrlFields | null;
  };
  type AdPage = {
    data?: AdRow[];
    paging?: { next?: string };
  };

  const byCampaign = new Map<
    string,
    { name: string; urls: Set<string>; creativeIds: Set<string> }
  >();

  const ensureCampaign = (
    campaignId: string,
    campaignName: string,
  ): { name: string; urls: Set<string>; creativeIds: Set<string> } => {
    let entry = byCampaign.get(campaignId);
    if (!entry) {
      entry = {
        name: campaignName || `Campanha ${campaignId}`,
        urls: new Set(),
        creativeIds: new Set(),
      };
      byCampaign.set(campaignId, entry);
    } else if (campaignName) {
      entry.name = campaignName;
    }
    return entry;
  };

  // 1) Todos os ads (só creative id — expansão nested no /ads falha com frequência)
  let nextUrl: string | null = null;
  let first = true;
  while (first || nextUrl) {
    first = false;
    const json: AdPage = nextUrl
      ? await metaGraphGet<AdPage>(nextUrl, accessToken)
      : await metaGraphGet<AdPage>(`${actId}/ads`, accessToken, {
          fields: "campaign_id,campaign{id,name},name,creative{id}",
          limit: "100",
        });

    for (const ad of json.data ?? []) {
      const id = String(ad.campaign_id ?? ad.campaign?.id ?? "").trim();
      if (!id) continue;
      const entry = ensureCampaign(
        id,
        ad.campaign?.name?.trim() || ad.name?.trim() || "",
      );
      const creativeId =
        ad.creative && "id" in ad.creative && ad.creative.id
          ? String(ad.creative.id)
          : null;
      if (creativeId) entry.creativeIds.add(creativeId);
    }
    nextUrl = json.paging?.next ?? null;
  }

  // 2) Hidratar creatives em batch (todas as URLs de destino)
  const allCreativeIds = [
    ...new Set(
      [...byCampaign.values()].flatMap((e) => [...e.creativeIds]),
    ),
  ];
  let creatives = new Map<string, MetaCreativeUrlFields>();
  if (allCreativeIds.length) {
    try {
      creatives = await metaGraphGetByIds<MetaCreativeUrlFields>(
        allCreativeIds,
        accessToken,
        META_CREATIVE_URL_FIELDS,
      );
    } catch {
      // Fallback: pedir cada creative individualmente (mais lento, mais fiável)
      for (const cid of allCreativeIds) {
        try {
          const one = await metaGraphGet<MetaCreativeUrlFields>(
            cid,
            accessToken,
            { fields: META_CREATIVE_URL_FIELDS },
          );
          if (one?.id || one?.link_url || one?.object_story_spec) {
            creatives.set(cid, { ...one, id: one.id ?? cid });
          }
        } catch {
          /* creative inacessível */
        }
      }
    }
  }

  const storyIdsNeedingFetch = new Set<string>();

  for (const entry of byCampaign.values()) {
    for (const cid of entry.creativeIds) {
      const creative = creatives.get(cid);
      if (!creative) continue;
      const urls = metaCreativeLandingUrls(creative);
      for (const u of urls) entry.urls.add(u);
      if (!urls.length) {
        const storyId = storyIdFromCreative(creative);
        if (storyId) storyIdsNeedingFetch.add(storyId);
      }
    }
  }

  // 3) Posts / object_story — URL só no post orgânico promovido
  if (storyIdsNeedingFetch.size) {
    try {
      const posts = await metaGraphGetByIds<MetaPostLinkFields>(
        [...storyIdsNeedingFetch],
        accessToken,
        "id,link,call_to_action,attachments{unshimmed_url,url,target}",
      );
      const storyToUrls = new Map<string, string[]>();
      for (const [sid, post] of posts) {
        storyToUrls.set(sid, metaPostLandingUrls(post));
      }
      for (const entry of byCampaign.values()) {
        for (const cid of entry.creativeIds) {
          const creative = creatives.get(cid);
          if (!creative) continue;
          if (metaCreativeLandingUrls(creative).length) continue;
          const storyId = storyIdFromCreative(creative);
          if (!storyId) continue;
          for (const u of storyToUrls.get(storyId) ?? []) entry.urls.add(u);
        }
      }
    } catch {
      /* posts opcional — creatives já cobrem a maioria */
    }
  }

  return [...byCampaign.entries()].map(([campaignId, v]) => ({
    campaignId,
    campaignName: v.name,
    landingUrls: [...v.urls],
  }));
}

