/**
 * Soft-delete empresas cujo legalName é frase/morada/lixo de Impressum.
 * Uso: node scripts/purge-noise-companies.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mongoose from "mongoose";

function loadEnv() {
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
}

function normalizeLegalName(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]+$/g, "")
    .toUpperCase();
}

const ENTITY_SUFFIX =
  "(?:LLC|L\\.L\\.C\\.|LIMITED|LTD\\.?|INC\\.?|GMBH|S\\.?A\\.?|S\\.?L\\.?|B\\.?V\\.?|SAS|SARL|OY|AB|PTY\\s+LTD)";

function isNoiseLegalName(name) {
  const key = normalizeLegalName(name);
  if (key.length < 5 || key.length > 80) return true;
  if (
    !/\b(LLC|L\.L\.C\.|LIMITED|LTD\.?|INC\.?|GMBH|S\.?A\.?|S\.?L\.?|B\.?V\.?|SAS|SARL|OY|AB|PTY\s+LTD)$/.test(
      key,
    )
  )
    return true;
  const words = key.split(/\s+/);
  if (words.length > 7) return true;
  if (
    /\b(ADDRESS|REGISTERED|BUSINESS|STREET|AVENUE|AVE|SUITE|STE|SHERIDAN|CASPER|WYOMING|COFFEEN|HANDELSNAME|HANDELSMARKE|IST\s+EIN|MODEHAUS|COPYRIGHT|GOOGLE|FACEBOOK|META\s+PLATFORMS|SHOPIFY|SPHERITY|ABOVE|BELOW|PRIVACY|POLICY|DATENSCHUTZ|TRADE\s+NAME|RABATT|VERSAND|GRATIS|POST|EXTRA|CKGABERECH|CKGABERECHT|R[UÜ]CKGABE|MEDIENG|@MEDIA|INFORMATION|ELOISE)\b/.test(
      key,
    )
  )
    return true;
  if (/\bAB$/.test(key) && words.length <= 3) return true;
  if (/^\d/.test(key)) return true;
  if (key === "LLC" || key === "LIMITED" || key === "GMBH" || key === "AB")
    return true;
  return false;
}

function extractCanonical(raw) {
  const key = normalizeLegalName(raw);
  if (!key || key.length < 5) return null;
  const suffixRe = new RegExp(`\\b${ENTITY_SUFFIX}\\b`, "g");
  const candidates = new Set();
  for (const m of key.matchAll(suffixRe)) {
    const suffix = m[0];
    const beforeTokens = key
      .slice(0, m.index)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    for (let n = 1; n <= 3; n++) {
      if (beforeTokens.length < n) break;
      const namePart = beforeTokens.slice(-n).join(" ");
      if (
        /^(OF|DER|DES|THE|A|AN|AND|UND|EIN|EINE|NAME|TRADE|FOR|MIT|VON)$/.test(
          namePart.split(/\s+/).pop() ?? "",
        )
      )
        continue;
      if (
        /^(OF|DER|DES|THE|A|AN|AND|UND|EIN|EINE|NAME|TRADE|FOR|MIT|VON)\b/.test(
          namePart,
        )
      )
        continue;
      candidates.add(normalizeLegalName(`${namePart} ${suffix}`));
    }
  }
  if (key.split(/\s+/).length <= 4) candidates.add(key);
  let best = null;
  let bestWords = Infinity;
  for (const c of candidates) {
    if (isNoiseLegalName(c)) continue;
    const w = c.split(/\s+/).length;
    if (w < bestWords) {
      bestWords = w;
      best = c;
    }
  }
  return best;
}

loadEnv();
await mongoose.connect(process.env.MONGODB_URI);
const col = mongoose.connection.db.collection("competitorcompanies");
const active = await col.find({ deletedAt: null }).toArray();
const now = new Date();
let n = 0;
const recreated = new Set();

for (const c of active) {
  const canonical = extractCanonical(c.legalName);
  const junk =
    !canonical ||
    isNoiseLegalName(c.legalName) ||
    normalizeLegalName(c.legalName) !== canonical;
  if (!junk) {
    console.log("keep", c.legalName);
    continue;
  }
  console.log("drop", JSON.stringify(c.legalName), "→", canonical);
  await col.updateOne({ _id: c._id }, { $set: { deletedAt: now } });
  n++;
  if (canonical && !recreated.has(canonical)) {
    const exists = await col.findOne({
      workspaceId: c.workspaceId,
      legalNameKey: canonical,
      deletedAt: null,
    });
    if (!exists) {
      await col.insertOne({
        workspaceId: c.workspaceId,
        legalName: canonical,
        legalNameKey: canonical,
        seedHosts: Array.isArray(c.seedHosts) ? c.seedHosts : [],
        storeCount: 0,
        activeAdCount: 0,
        countries: [],
        notes: "",
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      recreated.add(canonical);
      console.log("  +", canonical);
    }
  }
}

console.log(`\nRemoved ${n} noise companies.`);
await mongoose.disconnect();
