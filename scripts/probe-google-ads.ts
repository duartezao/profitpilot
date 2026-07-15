/**
 * Diagnóstico Google Ads API — developer token + refresh token da BD.
 * Uso:
 *   GOOGLE_ADS_DEVELOPER_TOKEN=xxx node --experimental-strip-types --import ./tests/resolve-alias.mjs --import ./tests/mock-server-only-hook.mjs scripts/probe-google-ads.ts [storeId]
 */
import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import { resolve } from "node:path";
import mongoose from "mongoose";
import { AdAccount } from "@/models/AdAccount";
import { AdPlatformCredential } from "@/models/AdPlatformCredential";
import { Store } from "@/models/Store";
import {
  fetchGoogleAdSpendForDay,
  humanizeGoogleAdsError,
  probeGoogleAdsApiAccess,
} from "@/lib/google-ads";

type GoogleCredentials = {
  refreshToken?: string;
  loginCustomerId?: string;
  googleCredentialId?: string;
};

function decryptBlob(blob: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY inválida.");
  const [ivB64, tagB64, dataB64] = blob.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function decryptAdCredentials<T extends Record<string, string>>(blob: string): T {
  return JSON.parse(decryptBlob(blob)) as T;
}

function dateKeyInTimezone(date: Date, ianaTimezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const envPath = resolve(process.cwd(), name);
    try {
      const raw = readFileSync(envPath, "utf8");
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 0) continue;
        const key = t.slice(0, i).trim();
        let val = t.slice(i + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
      return;
    } catch {
      /* try next */
    }
  }
}

async function main() {
  loadEnv();
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!devToken) {
    console.error("Falta GOOGLE_ADS_DEVELOPER_TOKEN no ambiente.");
    process.exit(1);
  }
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.error("Falta MONGODB_URI.");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const storeIdArg = process.argv[2]?.trim();
  let store = storeIdArg
    ? await Store.findById(storeIdArg).lean()
    : await Store.findOne({ deletedAt: null }).sort({ updatedAt: -1 }).lean();
  if (!store) {
    console.error("Loja não encontrada.");
    process.exit(1);
  }

  const tz = store.ianaTimezone?.trim() || "Europe/Brussels";
  const today = dateKeyInTimezone(new Date(), tz);
  const yesterday = dateKeyInTimezone(
    new Date(Date.now() - 86_400_000),
    tz,
  );

  console.log("--- Google Ads probe ---");
  console.log("API version:", process.env.GOOGLE_ADS_API_VERSION?.trim() || "v23");
  console.log("Developer token:", devToken.slice(0, 4) + "…" + devToken.slice(-4));
  console.log("Store:", store.name, String(store._id));

  const googleAccounts = await AdAccount.find({
    storeId: store._id,
    platform: "google",
    deletedAt: null,
  }).lean();

  if (googleAccounts.length === 0) {
    console.error("Sem contas Google Ads nesta loja.");
    process.exit(1);
  }

  for (const acc of googleAccounts) {
    const creds = decryptAdCredentials<GoogleCredentials>(acc.credentials);
    const refreshToken = creds.refreshToken?.trim();
    if (!refreshToken) {
      console.log(`\n[${acc.accountName}] sem refresh token`);
      continue;
    }

    const credRow = creds.googleCredentialId
      ? await AdPlatformCredential.findById(creds.googleCredentialId).lean()
      : null;
    const loginEmail = credRow?.loginEmail ?? "(desconhecido)";

    console.log(`\n=== ${acc.accountName} (${acc.externalAccountId}) — ${loginEmail} ===`);

    const probe = await probeGoogleAdsApiAccess(refreshToken);
    if (!probe.ok) {
      console.log("PROBE: FALHOU —", probe.error);
      continue;
    }
    console.log("PROBE: OK — lista de contas acessível");

    const loginCustomerId = creds.loginCustomerId?.trim() || undefined;
    for (const dateKey of [yesterday, today]) {
      try {
        const { spend, currency } = await fetchGoogleAdSpendForDay(
          refreshToken,
          acc.externalAccountId,
          dateKey,
          loginCustomerId,
        );
        console.log(`  ${dateKey}: ${spend.toFixed(2)} ${currency}`);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        console.log(`  ${dateKey}: ERRO —`, humanizeGoogleAdsError(raw, acc.externalAccountId));
      }
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
