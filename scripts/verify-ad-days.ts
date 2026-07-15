import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const mongoose = (await import("mongoose")).default;
const { ManualAdSpend } = await import("@/models/ManualAdSpend");
const { AdCampaignDay } = await import("@/models/AdCampaignDay");
const { Store } = await import("@/models/Store");
const { isApiSpendDayClosed } = await import("@/lib/ad-spend-complete");
const { dateKeyInTimezone, normalizeStoreTimezone } = await import(
  "@/lib/store-timezone"
);

await mongoose.connect(process.env.MONGODB_URI!);
const store = await Store.findById(storeId).select("name ianaTimezone").lean();
const tz = normalizeStoreTimezone(store?.ianaTimezone);
const today = dateKeyInTimezone(new Date(), tz);
const days = ["2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14"];

console.log(store?.name, "— hoje:", today, "\n");

for (const dateKey of days) {
  const spend = await ManualAdSpend.findOne({ storeId, dateKey }).lean();
  const campaigns = await AdCampaignDay.countDocuments({ storeId, dateKey });
  const closed = isApiSpendDayClosed(
    spend
      ? {
          dateKey,
          source: spend.source as string,
          amount: spend.amount,
          updatedAt: spend.updatedAt,
        }
      : null,
    today,
    tz,
  );
  const at = spend?.updatedAt
    ? new Date(spend.updatedAt).toISOString().slice(0, 16)
    : "—";
  console.log(
    `${dateKey}: ${spend?.amount?.toFixed(2) ?? "—"} ${spend?.currency ?? ""} | ${spend?.source ?? "—"} | campanhas: ${campaigns} | ${closed ? "Fechado" : "Parcial"} | ${at}`,
  );
}
await mongoose.disconnect();
