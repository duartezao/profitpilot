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
const dateKey = process.argv[3] ?? "2026-07-13";
const mongoose = (await import("mongoose")).default;
const { AdCampaignDay } = await import("@/models/AdCampaignDay");

await mongoose.connect(process.env.MONGODB_URI!);
const rows = await AdCampaignDay.find({ storeId, dateKey })
  .select("campaignName spend conversions conversionValue syncedAt")
  .sort({ spend: -1 })
  .limit(5)
  .lean();

const total = await AdCampaignDay.aggregate([
  { $match: { storeId: new mongoose.Types.ObjectId(storeId), dateKey } },
  {
    $group: {
      _id: null,
      spend: { $sum: "$spend" },
      conversions: { $sum: "$conversions" },
      convValue: { $sum: "$conversionValue" },
      n: { $sum: 1 },
      maxSync: { $max: "$syncedAt" },
    },
  },
]);

console.log(dateKey, "— top campanhas:");
for (const r of rows) {
  console.log(
    `  ${r.campaignName?.slice(0, 40)}: spend ${r.spend?.toFixed(2)} | conv ${r.conversions} | value ${r.conversionValue?.toFixed(2)}`,
  );
}
if (total[0]) {
  console.log(
    `\nTotal ${total[0].n} campanhas: spend ${total[0].spend.toFixed(2)} | conv ${total[0].conversions} | value ${total[0].convValue.toFixed(2)} | sync ${total[0].maxSync?.toISOString().slice(0, 16)}`,
  );
}
await mongoose.disconnect();
