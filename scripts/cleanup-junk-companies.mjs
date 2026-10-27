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

const JUNK_KEYS = new Set([
  "ENTERPRISES LLC",
  "GROUP LIMITED",
  "HAS LIMITED",
  "OUTLET LLC",
  "ECOM LLC",
  "LIMITED",
  "LLC",
]);

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const r = await db.collection("competitorcompanies").updateMany(
  {
    deletedAt: null,
    $or: [
      { legalNameKey: { $in: [...JUNK_KEYS] } },
      { legalName: { $in: [...JUNK_KEYS] } },
    ],
  },
  { $set: { deletedAt: new Date() } },
);
console.log("soft-deleted junk companies", r.modifiedCount);

const left = await db
  .collection("competitorcompanies")
  .find({ deletedAt: null })
  .project({ legalName: 1 })
  .sort({ legalName: 1 })
  .toArray();
console.log(
  "remaining",
  left.map((c) => c.legalName).join(" | "),
);
await mongoose.disconnect();
