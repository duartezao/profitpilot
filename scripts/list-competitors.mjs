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
const cos = await mongoose.connection.db
  .collection("competitorcompanies")
  .find({ deletedAt: null })
  .project({ legalName: 1, storeCount: 1, seedHosts: 1 })
  .toArray();
const doms = await mongoose.connection.db
  .collection("competitordomains")
  .find({ deletedAt: null })
  .project({ host: 1, isShopify: 1, brandName: 1, activeAdCount: 1 })
  .toArray();
console.log("COMPANIES", cos.length);
for (const c of cos) console.log("-", JSON.stringify(c.legalName));
console.log("DOMAINS", doms.length);
for (const d of doms)
  console.log("-", d.host, d.isShopify, d.activeAdCount, d.brandName);
await mongoose.disconnect();
