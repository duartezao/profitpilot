/** Normaliza host de loja (sem protocolo / www / path). */
export function normalizeHost(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0] ?? s;
  s = s.split("?")[0] ?? s;
  s = s.replace(/\.$/, "");
  return s;
}

/** CDNs / infra / plataformas — nunca são “lojas”. */
const BLOCKED_HOST_RE =
  /(^|\.)(google|googleapis|gstatic|googleusercontent|googletagmanager|doubleclick|googlesyndication|googleadservices|youtube|ytimg|facebook|fbcdn|instagram|cdninstagram|meta\.com|twitter|x\.com|t\.co|tiktok|bytedance|linkedin|microsoft|office|live\.com|azure|cloudflare|fastly|akamai|amazonaws|cloudfront|jsdelivr|unpkg|npmjs|github|githubusercontent|gitlab|bitbucket|w3\.org|example\.com|example\.org|localhost|shopify\.com|myshopify\.com|shopifycdn|klaviyo|hotjar|segment\.com|sentry|clarity\.ms|bing\.com|yahoo\.com|apple\.com|vimeo|pinterest|reddit|whatsapp|telegram|fonts\.)/i;

export function isBlockedHost(hostInput: string): boolean {
  const host = normalizeHost(hostInput);
  if (!host || !host.includes(".")) return true;
  if (host === "example.com" || host.endsWith(".example.com")) return true;
  return BLOCKED_HOST_RE.test(host);
}

/** Candidato a storefront (ainda precisa de confirmação Shopify). */
export function isPlausibleStoreHost(hostInput: string): boolean {
  const host = normalizeHost(hostInput);
  if (isBlockedHost(host)) return false;
  const labels = host.split(".");
  if (labels.length < 2) return false;
  // Subdomínios tipo cdn.*, static.*, img.* — lixo
  const sub = labels[0]!;
  if (
    /^(cdn|static|assets|img|images|media|fonts|api|ws|socket|tracking|pixel|tag|analytics)$/i.test(
      sub,
    )
  ) {
    return false;
  }
  return true;
}

export function normalizeLegalName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]+$/g, "")
    .toUpperCase();
}

/** Advertisers / nomes legais que não são competitors ecom. */
export function isNoiseLegalName(name: string): boolean {
  const key = normalizeLegalName(name);
  if (key.length < 4) return true;
  return (
    /\bGOOGLE\b/.test(key) ||
    /\bMETA\s+PLATFORMS\b/.test(key) ||
    /\bFACEBOOK\b/.test(key) ||
    /\bSHOPIFY\b/.test(key) ||
    /\bCOPYRIGHT\b/.test(key) ||
    /\bSPHERITY\b/.test(key) ||
    key === "LLC" ||
    key === "LIMITED"
  );
}

/** País ISO a partir do TLD quando possível; .com/.net ficam null (mundo). */
export function countryFromTld(host: string): string | null {
  const parts = host.split(".");
  const tld = parts[parts.length - 1]?.toLowerCase();
  if (!tld) return null;
  if (
    tld === "com" ||
    tld === "net" ||
    tld === "org" ||
    tld === "shop" ||
    tld === "store" ||
    tld === "online"
  ) {
    return null;
  }
  const map: Record<string, string> = {
    de: "DE",
    at: "AT",
    ch: "CH",
    hu: "HU",
    nl: "NL",
    be: "BE",
    fr: "FR",
    it: "IT",
    es: "ES",
    pt: "PT",
    pl: "PL",
    se: "SE",
    dk: "DK",
    no: "NO",
    fi: "FI",
    ie: "IE",
    uk: "GB",
    ca: "CA",
    au: "AU",
    nz: "NZ",
    us: "US",
    br: "BR",
    mx: "MX",
    ar: "AR",
    cl: "CL",
    co: "CO",
    jp: "JP",
    kr: "KR",
    in: "IN",
    sg: "SG",
    my: "MY",
    th: "TH",
    ph: "PH",
    id: "ID",
    vn: "VN",
    ae: "AE",
    sa: "SA",
    il: "IL",
    za: "ZA",
    ng: "NG",
    eg: "EG",
    tr: "TR",
    ru: "RU",
    ua: "UA",
    cz: "CZ",
    ro: "RO",
    bg: "BG",
    hr: "HR",
    sk: "SK",
    si: "SI",
    gr: "GR",
    lt: "LT",
    lv: "LV",
    ee: "EE",
  };
  return map[tld] ?? tld.toUpperCase();
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
