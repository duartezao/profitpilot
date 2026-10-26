import "server-only";
import {
  isNoiseLegalName,
  isPlausibleStoreHost,
  normalizeHost,
  normalizeLegalName,
} from "./normalize";

/**
 * Google Ads Transparency Center — RPC interno (best-effort, sem API oficial).
 * POST form-urlencoded `f.req=<json protobuf>` em /anji/_/rpc/...
 * Mundo: sem filtro de região (anywhere).
 */

export type TransparencyCreative = {
  creativeId: string | null;
  advertiserId: string | null;
  advertiserName: string | null;
  advertiserVerified: boolean;
  format: string | null;
  previewUrl: string | null;
  landingUrl: string | null;
  displayDomain: string | null;
  firstShown: string | null;
  lastShown: string | null;
  regions: string[];
};

export type TransparencyAdvertiser = {
  name: string;
  advertiserId: string;
  country: string | null;
  verified: boolean;
  adCountLow: number | null;
  adCountHigh: number | null;
};

export type TransparencyResult = {
  query: string;
  mode: "domain" | "advertiser";
  activeAdCount: number;
  advertisers: string[];
  advertiserIds: string[];
  creatives: TransparencyCreative[];
  discoveredHosts: string[];
  note: string | null;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const RPC_BASE = "https://adstransparency.google.com/anji/_/rpc";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractHostsFromText(text: string): string[] {
  const hosts = new Set<string>();
  const re =
    /https?:\/\/(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)/gi;
  for (const m of text.matchAll(re)) {
    const h = normalizeHost(m[1] ?? "");
    if (h && isPlausibleStoreHost(h)) hosts.add(h);
  }
  return [...hosts];
}

function unescapeJsBlob(js: string): string {
  return js
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\\//g, "/");
}

async function postRpc(
  serviceMethod: string,
  payload: Record<string, unknown>,
): Promise<unknown | null> {
  try {
    const res = await fetch(`${RPC_BASE}/${serviceMethod}?authuser=`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "*/*",
        Origin: "https://adstransparency.google.com",
        Referer: "https://adstransparency.google.com/?region=anywhere",
      },
      body: `f.req=${encodeURIComponent(JSON.stringify(payload))}`,
      signal: AbortSignal.timeout(25000),
    });
    const text = await res.text();
    if (
      res.status === 429 ||
      /\/sorry\//i.test(res.url) ||
      /unusual traffic|captcha/i.test(text.slice(0, 500))
    ) {
      return { __blocked: true };
    }
    if (!res.ok) return null;
    if (text.startsWith("<!") || text.startsWith("<html")) {
      return { __blocked: true };
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function isBlocked(rpc: unknown): boolean {
  return Boolean(
    rpc &&
      typeof rpc === "object" &&
      (rpc as { __blocked?: boolean }).__blocked,
  );
}

/** Resolve nome → advertiser IDs (anónimo). */
export async function searchSuggestions(
  query: string,
): Promise<TransparencyAdvertiser[]> {
  const rpc = await postRpc("SearchService/SearchSuggestions", {
    "1": query.trim(),
    "2": 15,
    "3": 15,
    "5": { "1": 1 },
  });
  if (!rpc || isBlocked(rpc) || typeof rpc !== "object") return [];

  const rows = (rpc as { "1"?: unknown[] })["1"];
  if (!Array.isArray(rows)) return [];

  const out: TransparencyAdvertiser[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const adv = (row as { "1"?: Record<string, unknown> })["1"];
    if (!adv || typeof adv !== "object") continue;
    const name = typeof adv["1"] === "string" ? adv["1"] : null;
    const id = typeof adv["2"] === "string" ? adv["2"] : null;
    if (!name || !id || isNoiseLegalName(name)) continue;
    const range = (adv["4"] as { "2"?: { "1"?: string; "2"?: string } } | undefined)
      ?.["2"];
    out.push({
      name,
      advertiserId: id,
      country: typeof adv["3"] === "string" ? adv["3"] : null,
      verified: Boolean(adv["5"]),
      adCountLow: range?.["1"] != null ? Number(range["1"]) : null,
      adCountHigh: range?.["2"] != null ? Number(range["2"]) : null,
    });
  }
  return out;
}

function parseCreative(raw: Record<string, unknown>): TransparencyCreative {
  const formatCode = typeof raw["4"] === "number" ? raw["4"] : null;
  const format =
    formatCode === 1
      ? "text"
      : formatCode === 2
        ? "image"
        : formatCode === 3
          ? "video"
          : formatCode != null
            ? `fmt_${formatCode}`
            : null;

  const block3 = raw["3"] as Record<string, unknown> | undefined;
  let previewUrl: string | null = null;
  let landingUrl: string | null = null;

  if (block3 && typeof block3 === "object") {
    const img = (block3["3"] as { "2"?: string } | undefined)?.["2"];
    if (typeof img === "string") {
      const m = img.match(/src="([^"]+)"/i);
      previewUrl = m?.[1] ?? null;
    }
    const videoOrHtml = (block3["1"] as { "4"?: string } | undefined)?.["4"];
    if (typeof videoOrHtml === "string") {
      landingUrl = videoOrHtml.startsWith("http") ? videoOrHtml : null;
      if (!previewUrl && videoOrHtml.includes("content.js")) {
        previewUrl = videoOrHtml;
      }
    }
  }

  const displayDomain =
    typeof raw["14"] === "string" ? normalizeHost(raw["14"]) : null;

  return {
    creativeId: typeof raw["2"] === "string" ? raw["2"] : null,
    advertiserId: typeof raw["1"] === "string" ? raw["1"] : null,
    advertiserName: typeof raw["12"] === "string" ? raw["12"] : null,
    advertiserVerified: false,
    format,
    previewUrl,
    landingUrl,
    displayDomain,
    firstShown: null,
    lastShown: null,
    regions: [],
  };
}

async function enrichHostsFromPreview(
  previewUrl: string,
  into: Set<string>,
): Promise<void> {
  if (!previewUrl.includes("content.js")) return;
  try {
    const res = await fetch(previewUrl, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return;
    const raw = unescapeJsBlob(await res.text());
    for (const h of extractHostsFromText(raw)) into.add(h);
    // Domínios “nus” típicos de display URL no blob
    for (const m of raw.matchAll(
      /\b([a-z0-9][a-z0-9-]{1,40}\.(?:com|net|org|shop|store|at|de|ch|hu|nl|be|fr|it|es|pt|pl|se|dk|no|fi|ie|co\.uk|com\.au))\b/gi,
    )) {
      const h = normalizeHost(m[1] ?? "");
      if (h && isPlausibleStoreHost(h)) into.add(h);
    }
  } catch {
    /* best-effort */
  }
}

type CreativesPage = {
  creatives: TransparencyCreative[];
  nextCursor: string | null;
  blocked: boolean;
};

async function searchCreativesPage(opts: {
  domain?: string;
  advertiserIds?: string[];
  cursor?: string | null;
  pageSize?: number;
}): Promise<CreativesPage> {
  const filter: Record<string, unknown> = {};
  if (opts.domain) {
    filter["12"] = { "1": normalizeHost(opts.domain), "2": true };
  }
  if (opts.advertiserIds?.length) {
    filter["13"] = { "1": opts.advertiserIds };
  }
  const payload: Record<string, unknown> = {
    "2": opts.pageSize ?? 40,
    "3": filter,
    "7": { "1": 1 },
  };
  if (opts.cursor) payload["4"] = opts.cursor;

  const rpc = await postRpc("SearchService/SearchCreatives", payload);
  if (!rpc) return { creatives: [], nextCursor: null, blocked: false };
  if (isBlocked(rpc)) return { creatives: [], nextCursor: null, blocked: true };

  const obj = rpc as { "1"?: unknown[]; "2"?: string };
  const list = Array.isArray(obj["1"]) ? obj["1"] : [];
  const creatives = list
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map(parseCreative);

  return {
    creatives,
    nextCursor: typeof obj["2"] === "string" ? obj["2"] : null,
    blocked: false,
  };
}

async function collectCreatives(opts: {
  domain?: string;
  advertiserIds?: string[];
  maxPages?: number;
  enrichPreviews?: boolean;
}): Promise<{
  creatives: TransparencyCreative[];
  hosts: string[];
  blocked: boolean;
  note: string | null;
}> {
  const all: TransparencyCreative[] = [];
  const hosts = new Set<string>();
  let cursor: string | null = null;
  const maxPages = opts.maxPages ?? 5;

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await sleep(400);
    const batch = await searchCreativesPage({
      domain: opts.domain,
      advertiserIds: opts.advertiserIds,
      cursor,
      pageSize: 40,
    });
    if (batch.blocked) {
      return {
        creatives: all,
        hosts: [...hosts],
        blocked: true,
        note: "Transparency rate-limit / captcha — tenta mais tarde",
      };
    }
    if (!batch.creatives.length) break;
    all.push(...batch.creatives);
    for (const c of batch.creatives) {
      if (c.displayDomain && isPlausibleStoreHost(c.displayDomain)) {
        hosts.add(c.displayDomain);
      }
      if (c.landingUrl) {
        for (const h of extractHostsFromText(c.landingUrl)) hosts.add(h);
      }
    }
    cursor = batch.nextCursor;
    if (!cursor) break;
  }

  // Enrich subset of content.js previews (domínios de landing)
  if (opts.enrichPreviews !== false) {
    const previews = all
      .map((c) => c.previewUrl)
      .filter((u): u is string => Boolean(u && u.includes("content.js")))
      .slice(0, 12);
    for (const url of previews) {
      await enrichHostsFromPreview(url, hosts);
      await sleep(250);
    }
  }

  return {
    creatives: all,
    hosts: [...hosts],
    blocked: false,
    note: null,
  };
}

export async function searchTransparencyByDomain(
  domainInput: string,
): Promise<TransparencyResult> {
  const host = normalizeHost(domainInput);
  const collected = await collectCreatives({
    domain: host,
    maxPages: 4,
    enrichPreviews: true,
  });

  const advertisers = new Set<string>();
  const advertiserIds = new Set<string>();
  for (const c of collected.creatives) {
    if (c.advertiserName && !isNoiseLegalName(c.advertiserName)) {
      advertisers.add(normalizeLegalName(c.advertiserName));
    }
    if (c.advertiserId) advertiserIds.add(c.advertiserId);
  }

  return {
    query: host,
    mode: "domain",
    activeAdCount: collected.creatives.length,
    advertisers: [...advertisers],
    advertiserIds: [...advertiserIds],
    creatives: collected.creatives.slice(0, 80),
    discoveredHosts: collected.hosts.filter((h) => h !== host),
    note: collected.blocked
      ? collected.note
      : collected.creatives.length
        ? `Transparency RPC domain · ${collected.creatives.length} creatives`
        : "Sem creatives para este domain",
  };
}

export async function searchTransparencyByAdvertiser(
  legalName: string,
): Promise<TransparencyResult> {
  const name = legalName.trim();
  const suggestions = await searchSuggestions(name);
  await sleep(300);

  // Preferir o advertiser com mais ads (range high)
  const sorted = [...suggestions].sort(
    (a, b) => (b.adCountHigh ?? 0) - (a.adCountHigh ?? 0),
  );
  const ids = sorted.map((s) => s.advertiserId).slice(0, 5);

  if (!ids.length) {
    return {
      query: name,
      mode: "advertiser",
      activeAdCount: 0,
      advertisers: [],
      advertiserIds: [],
      creatives: [],
      discoveredHosts: [],
      note: "Sem advertisers Transparency para este nome",
    };
  }

  const collected = await collectCreatives({
    advertiserIds: ids,
    maxPages: 6,
    enrichPreviews: true,
  });

  // Estimativa de ads do suggestion range (UI) se RPC devolver pouco
  const suggestedHigh = Math.max(
    0,
    ...sorted.map((s) => s.adCountHigh ?? 0),
  );
  const activeAdCount = Math.max(collected.creatives.length, suggestedHigh);

  const advertisers = new Set<string>(
    sorted.map((s) => normalizeLegalName(s.name)),
  );

  return {
    query: name,
    mode: "advertiser",
    activeAdCount,
    advertisers: [...advertisers],
    advertiserIds: ids,
    creatives: collected.creatives.slice(0, 80),
    discoveredHosts: collected.hosts,
    note: collected.blocked
      ? collected.note
      : `Transparency RPC · ${ids.length} advertisers · ${collected.creatives.length} creatives · ${collected.hosts.length} hosts`,
  };
}
