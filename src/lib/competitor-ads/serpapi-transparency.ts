import "server-only";
import {
  isNoiseLegalName,
  isPlausibleStoreHost,
  normalizeHost,
  normalizeLegalName,
} from "./normalize";
import type { TransparencyCreative, TransparencyResult } from "./transparency";

/**
 * Google Ads Transparency via SerpAPI — o scrape corre nos IPs da SerpAPI,
 * não no IP do servidor ProfitPilot (evita 429/captcha/flag).
 *
 * Env: SERPAPI_API_KEY (ou SERPAPI_KEY)
 */

function getSerpApiKey(): string {
  return (
    process.env.SERPAPI_API_KEY?.trim() ||
    process.env.SERPAPI_KEY?.trim() ||
    ""
  );
}

export function hasSerpApiKey(): boolean {
  return Boolean(getSerpApiKey());
}

type SerpAdCreative = {
  advertiser_id?: string;
  advertiser?: string;
  ad_creative_id?: string;
  format?: string;
  link?: string;
  target_domain?: string;
  details_link?: string;
  total_days_shown?: number;
  first_shown?: number;
  last_shown?: number;
};

type SerpSearchJson = {
  error?: string;
  search_information?: { total_results?: number };
  advertiser?: { id?: string; name?: string; legal_name?: string };
  ad_creatives?: SerpAdCreative[];
};

type SerpDetailsJson = {
  error?: string;
  ad_creatives?: Array<{
    link?: string;
    visible_link?: string;
    title?: string;
    headline?: string;
    image?: string;
    thumbnail?: string;
  }>;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function serpGet(
  engine: string,
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const key = getSerpApiKey();
  if (!key) return null;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", engine);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(45000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hostFromMaybeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    const h = normalizeHost(new URL(href).hostname);
    return h && isPlausibleStoreHost(h) ? h : null;
  } catch {
    const h = normalizeHost(raw);
    return h && isPlausibleStoreHost(h) ? h : null;
  }
}

function normalizeLanding(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("http")) return null;
  // Ignorar previews Google / CDNs
  if (
    /googleusercontent\.com|googlesyndication|doubleclick|gstatic\.com/i.test(
      raw,
    )
  ) {
    return null;
  }
  return raw;
}

async function enrichLandingUrls(
  creatives: TransparencyCreative[],
  maxDetails = 6,
): Promise<void> {
  const need = creatives.filter(
    (c) => c.advertiserId && c.creativeId && !c.landingUrl,
  );
  let done = 0;
  for (const c of need) {
    if (done >= maxDetails) break;
    const json = (await serpGet("google_ads_transparency_center_ad_details", {
      advertiser_id: c.advertiserId!,
      creative_id: c.creativeId!,
    })) as SerpDetailsJson | null;
    done++;
    if (!json || json.error) continue;
    const detail = json.ad_creatives?.[0];
    if (!detail) continue;
    const landing =
      normalizeLanding(detail.link) ||
      normalizeLanding(
        detail.visible_link?.startsWith("http")
          ? detail.visible_link
          : detail.visible_link
            ? `https://${detail.visible_link}`
            : null,
      );
    if (landing) c.landingUrl = landing;
    if (!c.previewUrl && (detail.image || detail.thumbnail)) {
      c.previewUrl = detail.image || detail.thumbnail || null;
    }
    await sleep(150);
  }
}

function mapSerpCreatives(rows: SerpAdCreative[]): TransparencyCreative[] {
  return rows.map((r) => {
    const displayDomain = r.target_domain
      ? normalizeHost(r.target_domain)
      : null;
    return {
      creativeId: r.ad_creative_id ?? null,
      advertiserId: r.advertiser_id ?? null,
      advertiserName: r.advertiser ?? null,
      advertiserVerified: false,
      format: r.format ?? null,
      previewUrl: r.link?.includes("content.js") ? r.link : null,
      landingUrl: normalizeLanding(r.link),
      displayDomain:
        displayDomain && isPlausibleStoreHost(displayDomain)
          ? displayDomain
          : null,
      firstShown: r.first_shown ? String(r.first_shown) : null,
      lastShown: r.last_shown ? String(r.last_shown) : null,
      regions: [],
    };
  });
}

async function searchSerpText(
  text: string,
  mode: "domain" | "advertiser",
): Promise<TransparencyResult> {
  const json = (await serpGet("google_ads_transparency_center", {
    text,
    num: "40",
  })) as SerpSearchJson | null;

  if (!json) {
    return {
      query: text,
      mode,
      activeAdCount: 0,
      advertisers: [],
      advertiserIds: [],
      creatives: [],
      discoveredHosts: [],
      note: "SerpAPI sem resposta — verifica SERPAPI_API_KEY.",
    };
  }
  if (json.error) {
    return {
      query: text,
      mode,
      activeAdCount: 0,
      advertisers: [],
      advertiserIds: [],
      creatives: [],
      discoveredHosts: [],
      note: `SerpAPI: ${json.error}`,
    };
  }

  const rows = json.ad_creatives ?? [];
  const creatives = mapSerpCreatives(rows);
  await enrichLandingUrls(creatives, mode === "advertiser" ? 8 : 4);

  const hosts = new Set<string>();
  const advertisers = new Set<string>();
  const advertiserIds = new Set<string>();

  for (const c of creatives) {
    if (c.displayDomain) hosts.add(c.displayDomain);
    if (c.landingUrl) {
      const h = hostFromMaybeUrl(c.landingUrl);
      if (h) hosts.add(h);
    }
    if (c.advertiserName && !isNoiseLegalName(c.advertiserName)) {
      advertisers.add(normalizeLegalName(c.advertiserName));
    }
    if (c.advertiserId) advertiserIds.add(c.advertiserId);
  }

  if (json.advertiser?.legal_name || json.advertiser?.name) {
    const n = json.advertiser.legal_name || json.advertiser.name!;
    if (!isNoiseLegalName(n)) advertisers.add(normalizeLegalName(n));
  }
  if (json.advertiser?.id) advertiserIds.add(json.advertiser.id);

  const total =
    json.search_information?.total_results ?? creatives.length;

  return {
    query: text,
    mode,
    activeAdCount: total,
    advertisers: [...advertisers],
    advertiserIds: [...advertiserIds],
    creatives: creatives.slice(0, 80),
    discoveredHosts: [...hosts],
    note: `SerpAPI · ${creatives.length} creatives · ${hosts.size} hosts (sem IP local)`,
  };
}

export async function searchSerpTransparencyByDomain(
  domainInput: string,
): Promise<TransparencyResult> {
  return searchSerpText(normalizeHost(domainInput), "domain");
}

export async function searchSerpTransparencyByAdvertiser(
  legalName: string,
): Promise<TransparencyResult> {
  return searchSerpText(legalName.trim(), "advertiser");
}
