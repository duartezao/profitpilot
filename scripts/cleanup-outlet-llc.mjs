import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mongoose from "mongoose";

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

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
await db.collection("competitorcompanies").updateMany(
  { legalNameKey: { $in: ["OUTLET LLC", "CKGABERECHT AB"] } },
  { $set: { deletedAt: new Date() } },
);
const cos = await db
  .collection("competitorcompanies")
  .find({ deletedAt: null })
  .project({ legalName: 1, storeCount: 1 })
  .toArray();
const doms = await db
  .collection("competitordomains")
  .find({ deletedAt: null, isShopify: true })
  .project({ host: 1, companyId: 1 })
  .toArray();
console.log("companies", cos);
console.log(
  "domains",
  doms.map((d) => ({ host: d.host, co: String(d.companyId) })),
);
await mongoose.disconnect();
