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
const hosts = [
  "eloise-newyork.com",
  "modehaus-caroline.de",
  "islaedinburgh.com",
  "modehaus-carafine.de",
];
const r = await mongoose.connection.db.collection("competitordomains").updateMany(
  { host: { $in: hosts } },
  { $set: { isShopify: true, isActive: true }, $unset: { deletedAt: "" } },
);
console.log("restored matched", r.matchedCount, "modified", r.modifiedCount);
const doms = await mongoose.connection.db
  .collection("competitordomains")
  .find({ host: { $in: hosts } })
  .project({ host: 1, deletedAt: 1, isShopify: 1, companyId: 1 })
  .toArray();
console.log(doms);
await mongoose.disconnect();
