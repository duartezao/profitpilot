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

const own = await db
  .collection("stores")
  .find({ deletedAt: null })
  .project({ displayUrl: 1 })
  .toArray();
const ownHosts = own
  .map((s) => String(s.displayUrl || "").toLowerCase())
  .filter(Boolean);
console.log("own hosts", ownHosts);

const logos = await db
  .collection("competitorcompanies")
  .findOne({ legalNameKey: "LOGOS ECOM LLC" });
if (!logos) {
  console.log("LOGOS not found");
  process.exit(0);
}

const cleaned = (logos.seedHosts || []).filter(
  (h) => !ownHosts.includes(String(h).toLowerCase()),
);
await db.collection("competitorcompanies").updateOne(
  { _id: logos._id },
  { $set: { seedHosts: cleaned } },
);

await db.collection("competitordomains").updateMany(
  {
    host: { $in: ownHosts },
    companyId: logos._id,
  },
  { $set: { deletedAt: new Date(), isActive: false } },
);

console.log("seeds cleaned", cleaned);
await mongoose.disconnect();
