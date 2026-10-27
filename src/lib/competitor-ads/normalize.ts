/** Normaliza host de loja (sem protocolo / www / path / lixo de UI). */
export function normalizeHost(input: string): string {
  let s = input.trim().toLowerCase();
  // Reticências / underscores / zero-width que às vezes vêm de logs/UI
  s = s.replace(/[\u2026\u2025\u22ef\u00b7\u200b-\u200f\u2028\u2029\ufeff]/g, "");
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0] ?? s;
  s = s.split("?")[0] ?? s;
  s = s.split("#")[0] ?? s;
  s = s.replace(/[._]+$/g, "");
  // Só labels DNS válidos
  s = s.replace(/[^a-z0-9.-]/g, "");
  s = s.replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");
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

const ENTITY_SUFFIX =
  "(?:LLC|L\\.L\\.C\\.|LIMITED|LTD\\.?|INC\\.?|GMBH|S\\.?A\\.?|S\\.?L\\.?|B\\.?V\\.?|SAS|SARL|OY|AB|PTY\\s+LTD)";

/**
 * Extrai o nome legal canónico curto (ex. «CAVALEIRUS LLC») de um blob de texto.
 * Para cada sufixo societário, fica só com 1–3 palavras imediatamente antes
 * (evita «THE WYOMING ADDRESS … OF CAVALEIRUS LLC»).
 */
export function extractCanonicalLegalName(raw: string): string | null {
  const key = normalizeLegalName(raw);
  if (!key || key.length < 5) return null;

  const suffixRe = new RegExp(`\\b${ENTITY_SUFFIX}\\b`, "g");
  const tokens = key.split(/\s+/);
  const candidates = new Set<string>();

  for (const m of key.matchAll(suffixRe)) {
    const suffix = m[0]!;
    const before = key.slice(0, m.index).trim();
    const beforeTokens = before.split(/\s+/).filter(Boolean);
    // 1 a 3 tokens antes do sufixo
    for (let n = 1; n <= 3; n++) {
      if (beforeTokens.length < n) break;
      const namePart = beforeTokens.slice(-n).join(" ");
      // Evitar preposições / lixo como último token do nome
      if (
        /^(OF|DER|DES|THE|A|AN|AND|UND|EIN|EINE|NAME|TRADE|FOR|MIT|VON)$/.test(
          namePart.split(/\s+/).pop() ?? "",
        )
      ) {
        continue;
      }
      if (
        /^(OF|DER|DES|THE|A|AN|AND|UND|EIN|EINE|NAME|TRADE|FOR|MIT|VON)\b/.test(
          namePart,
        )
      ) {
        continue;
      }
      candidates.add(normalizeLegalName(`${namePart} ${suffix}`));
    }
  }

  // Também: se o raw já é curto e limpo
  if (tokens.length <= 4) {
    candidates.add(key);
  }

  let best: string | null = null;
  let bestWords = Infinity;
  for (const c of candidates) {
    if (isNoiseLegalName(c)) continue;
    const words = c.split(/\s+/).length;
    if (words < bestWords) {
      bestWords = words;
      best = c;
    }
  }
  return best;
}

/** Advertisers / nomes legais que não são competitors ecom. */
export function isNoiseLegalName(name: string): boolean {
  const key = normalizeLegalName(name);
  if (key.length < 5 || key.length > 60) return true;

  // Tem de acabar em forma societária
  if (
    !/\b(LLC|L\.L\.C\.|LIMITED|LTD\.?|INC\.?|GMBH|S\.?A\.?|S\.?L\.?|B\.?V\.?|SAS|SARL|OY|AB|PTY\s+LTD)$/.test(
      key,
    )
  ) {
    return true;
  }

  // Nome legal real: tipicamente 2–4 tokens (ACME LLC / ACME HANDELS GMBH)
  const words = key.split(/\s+/);
  if (words.length > 5) return true;

  // Boilerplate / lixo típico de Impressum / promo / UI scrap
  if (
    /\b(ADDRESS|REGISTERED|BUSINESS|STREET|AVENUE|AVE|SUITE|STE|SHERIDAN|CASPER|WYOMING|COFFEEN|HANDELSNAME|HANDELSMARKE|IST\s+EIN|MODEHAUS|COPYRIGHT|GOOGLE|FACEBOOK|INSTAGRAM|META\s+PLATFORMS|SHOPIFY|SPHERITY|ABOVE|BELOW|PRIVACY|POLICY|DATENSCHUTZ|TRADE\s+NAME|TRADEMARK|TRADEMARKED|RABATT|VERSAND|GRATIS|POST|EXTRA|CKGABERECH|CKGABERECHT|R[UÜ]CKGABE|MEDIENG|@MEDIA|INFORMATION|ELOISE|VIEW\s*ALL|PRODUCTS|NAMES\s+ARE|WENDOUGEE|OCTOBER|COMPANY\s+INFORMATION|SOFORT|ANALYTICS|GDPR|SCHEMA|CLOUDFLARE|MICROSOFT|APPLE|AMAZON|TWITTER|TIKTOK|KLAVIYO|HOTJAR)\b/.test(
      key,
    )
  ) {
    return true;
  }

  // «AB» sueco quase só gera falsos positivos em texto DE (Rabatt ab, …)
  if (/\bAB$/.test(key) && words.length <= 3) return true;

  // Promo / lixo que acaba em AB (Suécia) por acidente
  if (/\b(RABATT|VERSAND|GRATIS|POST|EXTRA)\b/.test(key) && /\bAB$/.test(key)) {
    return true;
  }

  // Só dígitos + LLC
  if (/^\d/.test(key)) return true;

  if (key === "LLC" || key === "LIMITED" || key === "GMBH" || key === "AB") {
    return true;
  }

  // Nome demasiado genérico / 1 token + AB curto
  if (
    words.length <= 2 &&
    /^(RABATT|VERSAND|POST|EXTRA|CKGABERECH|ECOM)\b/.test(key)
  ) {
    return true;
  }

  return false;
}

/** Nome legal curto e plausível (pronto a gravar). */
export function isPlausibleLegalName(name: string): boolean {
  const canonical = extractCanonicalLegalName(name);
  return Boolean(canonical) && !isNoiseLegalName(canonical!);
}

const LANG_TO_COUNTRY: Record<string, string> = {
  de: "DE",
  at: "AT",
  ch: "CH",
  nl: "NL",
  be: "BE",
  fr: "FR",
  it: "IT",
  es: "ES",
  pt: "PT",
  pl: "PL",
  se: "SE",
  sv: "SE",
  da: "DK",
  dk: "DK",
  no: "NO",
  nb: "NO",
  nn: "NO",
  fi: "FI",
  hu: "HU",
  cs: "CZ",
  sk: "SK",
  sl: "SI",
  hr: "HR",
  ro: "RO",
  bg: "BG",
  el: "GR",
  gr: "GR",
  lt: "LT",
  lv: "LV",
  et: "EE",
  ee: "EE",
  uk: "GB",
  en: "XX", // inglês genérico — país vem do TLD / locale region
  ga: "IE",
  ie: "IE",
  ca: "ES", // catalão → ES (mercado tipicamente ES)
  eu: "ES",
  gl: "ES",
  ja: "JP",
  ko: "KR",
  zh: "CN",
  th: "TH",
  vi: "VN",
  id: "ID",
  ms: "MY",
  tr: "TR",
  ru: "RU",
  ukr: "UA",
  ar: "AE",
  he: "IL",
  hi: "IN",
  br: "BR",
  mx: "MX",
  au: "AU",
  nz: "NZ",
  us: "US",
  gb: "GB",
};

/**
 * País a partir de `lang` / locale da loja.
 * Aceita: "es", "es-ES", "de-AT", "fr_BE", "pt-PT".
 * Prioriza a região (ES, AT, BE…) quando existe; senão o idioma.
 */
export function countryFromLang(langInput: string | null | undefined): string | null {
  if (!langInput) return null;
  const raw = langInput.trim().replace(/_/g, "-").toLowerCase();
  if (!raw) return null;
  const [lang, region] = raw.split("-");
  if (region && /^[a-z]{2}$/.test(region)) {
    const fromRegion = LANG_TO_COUNTRY[region] ?? region.toUpperCase();
    // en-US → US; en-GB → GB; en-AU → AU
    if (fromRegion !== "XX") return fromRegion.length === 2 ? fromRegion : region.toUpperCase();
    return region.toUpperCase();
  }
  if (!lang) return null;
  const mapped = LANG_TO_COUNTRY[lang];
  if (!mapped || mapped === "XX") return null;
  return mapped;
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

/**
 * País da loja: 1) lang/locale do HTML  2) TLD
 * Ex.: sofia-barcelona.com com lang=es → ES (não XX).
 */
export function countryFromStoreSignals(opts: {
  host: string;
  htmlLang?: string | null;
  ogLocale?: string | null;
}): string | null {
  return (
    countryFromLang(opts.ogLocale) ||
    countryFromLang(opts.htmlLang) ||
    countryFromTld(opts.host)
  );
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
