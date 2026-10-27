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

const JUNK =
  /\b(GOOGLE|FACEBOOK|INSTAGRAM|SOFORT|ANALYTICS|GDPR|SCHEMA|CLOUDFLARE|MICROSOFT|APPLE|AMAZON|TIKTOK|KLAVIYO|SHOPIFY|META|HOTJAR)\b/i;

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const cos = await db
  .collection("competitorcompanies")
  .find({ deletedAt: null })
  .toArray();
let n = 0;
for (const c of cos) {
  if (!JUNK.test(c.legalName)) continue;
  await db
    .collection("competitorcompanies")
    .updateOne({ _id: c._id }, { $set: { deletedAt: new Date() } });
  console.log("del", c.legalName);
  n++;
}
console.log("removed", n);
await mongoose.disconnect();
