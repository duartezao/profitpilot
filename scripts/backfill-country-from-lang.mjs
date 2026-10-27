/** Regrava country das lojas competitor a partir do lang/og:locale do HTML. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import http from "node:http";
import https from "node:https";
import mongoose from "mongoose";
import * as cheerio from "cheerio";

for (const name of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), name), "utf8").split(
      "\n",
    )) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      )
        val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* */
  }
}

function countryFromLang(langInput) {
  if (!langInput) return null;
  const raw = String(langInput).trim().replace(/_/g, "-").toLowerCase();
  const [lang, region] = raw.split("-");
  const map = {
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
    sv: "SE",
    da: "DK",
    no: "NO",
    fi: "FI",
    hu: "HU",
    cs: "CZ",
    us: "US",
    gb: "GB",
    au: "AU",
    nz: "NZ",
    ca: "CA",
  };
  if (region && /^[a-z]{2}$/.test(region)) return map[region] ?? region.toUpperCase();
  if (lang === "en") return null;
  return map[lang] ?? null;
}

function countryFromTld(host) {
  const tld = host.split(".").pop();
  const map = {
    de: "DE",
    at: "AT",
    ch: "CH",
    it: "IT",
    es: "ES",
    fr: "FR",
    nl: "NL",
    be: "BE",
    pt: "PT",
    uk: "GB",
  };
  return map[tld] ?? null;
}

function fetchText(url, redirects = 0) {
  if (redirects > 5) return Promise.resolve(null);
  return new Promise((resolvePromise) => {
    const lib = url.startsWith("http:") ? http : https;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
        timeout: 18000,
        rejectUnauthorized: false,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          void fetchText(next, redirects + 1).then(resolvePromise);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          resolvePromise(null);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolvePromise(body || null));
      },
    );
    req.on("error", () => resolvePromise(null));
    req.on("timeout", () => {
      req.destroy();
      resolvePromise(null);
    });
  });
}

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const domains = await db
  .collection("competitordomains")
  .find({ deletedAt: null, isShopify: true })
  .project({ host: 1, country: 1 })
  .toArray();

for (const d of domains) {
  const html = await fetchText(`https://${d.host}`);
  let country = null;
  let lang = null;
  if (html) {
    const $ = cheerio.load(html);
    lang = $("html").attr("lang") || null;
    const og = $('meta[property="og:locale"]').attr("content") || null;
    country = countryFromLang(og) || countryFromLang(lang) || countryFromTld(d.host);
  } else {
    country = countryFromTld(d.host);
  }
  if (!country) {
    console.log(d.host, "lang=", lang, "→ — (mantém", d.country ?? "null", ")");
    continue;
  }
  await db
    .collection("competitordomains")
    .updateOne({ _id: d._id }, { $set: { country } });
  console.log(d.host, "lang=", lang, "→", country, d.country && d.country !== country ? `(era ${d.country})` : "");
}

await mongoose.disconnect();
