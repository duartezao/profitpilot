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

loadEnv();
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const company = await db.collection("competitorcompanies").findOne({
  legalNameKey: "CAVALEIRUS LLC",
  deletedAt: null,
});
if (!company) {
  console.log("no CAVALEIRUS LLC");
  process.exit(0);
}
const hosts = [
  "eloise-newyork.com",
  "modehaus-caroline.de",
  "claragraz.at",
];
const r = await db.collection("competitordomains").updateMany(
  { host: { $in: hosts }, deletedAt: null },
  { $set: { companyId: company._id } },
);
console.log("relinked", r.modifiedCount, "→", company._id.toString());

const domains = await db
  .collection("competitordomains")
  .find({ companyId: company._id, deletedAt: null, isShopify: true })
  .toArray();
const countries = [
  ...new Set(domains.map((d) => d.country).filter(Boolean)),
].sort();
const activeAdCount = domains.reduce((s, d) => s + (d.activeAdCount ?? 0), 0);
await db.collection("competitorcompanies").updateOne(
  { _id: company._id },
  {
    $set: {
      storeCount: domains.length,
      activeAdCount,
      countries,
    },
  },
);
console.log("aggregates", {
  stores: domains.length,
  ads: activeAdCount,
  countries,
});
await mongoose.disconnect();
