import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDecipheriv } from "node:crypto";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), name), "utf8");
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
      /* */
    }
  }
}
loadEnv();

const storeId = process.argv[2] ?? "6a2f3c90f28d6fea7e49ddf3";
const dateKey = process.argv[3] ?? "2026-07-14";

function decryptBlob(blob: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  const [ivB64, tagB64, dataB64] = blob.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

const mongoose = (await import("mongoose")).default;
const { AdAccount } = await import("@/models/AdAccount");
const { ManualAdSpend } = await import("@/models/ManualAdSpend");
const { fetchGoogleAdSpendForDay } = await import("@/lib/google-ads");

await mongoose.connect(process.env.MONGODB_URI!);
const acc = await AdAccount.findOne({ storeId, platform: "google", deletedAt: null }).lean();
const creds = JSON.parse(decryptBlob(acc!.credentials));
const api = await fetchGoogleAdSpendForDay(
  creds.refreshToken,
  acc!.externalAccountId,
  dateKey,
  creds.loginCustomerId,
);
const doc = await ManualAdSpend.findOne({ storeId, dateKey }).lean();

console.log("Dia:", dateKey);
console.log("API customer spend:", api.spend.toFixed(2), api.currency);
console.log("BD ManualAdSpend amount:", doc?.amount?.toFixed(2), doc?.currency);
console.log("BD inputAmount:", doc?.inputAmount?.toFixed(2), doc?.inputCurrency);
console.log("BD extraFee:", doc?.extraFee);
console.log("BD lines:", JSON.stringify(doc?.lines, null, 2));
await mongoose.disconnect();
