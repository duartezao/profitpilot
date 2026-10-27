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
const cos = await db
  .collection("competitorcompanies")
  .find({ deletedAt: null, legalName: /GRACA|ENTERPRISES/i })
  .project({ legalName: 1, legalNameKey: 1, seedHosts: 1, storeCount: 1 })
  .toArray();
console.log(JSON.stringify(cos, null, 2));
await mongoose.disconnect();
