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

const cos = await db
  .collection("competitorcompanies")
  .find({})
  .project({ legalName: 1, deletedAt: 1, storeCount: 1, seedHosts: 1, _id: 1 })
  .sort({ updatedAt: -1 })
  .limit(15)
  .toArray();
console.log("=== COMPANIES ===");
for (const c of cos) {
  console.log(
    c.deletedAt ? "DEL" : "OK ",
    String(c._id),
    JSON.stringify(c.legalName),
    "stores=",
    c.storeCount,
    "seeds=",
    c.seedHosts,
  );
}

const doms = await db
  .collection("competitordomains")
  .find({})
  .project({
    host: 1,
    deletedAt: 1,
    isShopify: 1,
    companyId: 1,
    activeAdCount: 1,
  })
  .limit(30)
  .toArray();
console.log("\n=== DOMAINS ===");
for (const d of doms) {
  console.log(
    d.deletedAt ? "DEL" : "OK ",
    d.host,
    "shopify=",
    d.isShopify,
    "ads=",
    d.activeAdCount,
    "co=",
    d.companyId ? String(d.companyId) : null,
  );
}

const runs = await db
  .collection("competitordiscoveryruns")
  .find({})
  .sort({ createdAt: -1 })
  .limit(3)
  .toArray();
console.log("\n=== RUNS ===");
for (const r of runs) {
  console.log(
    r.status,
    r.trigger,
    "co=",
    r.companiesScanned,
    "dom=",
    r.domainsScanned,
    "+c",
    r.newCompanies,
    "+d",
    r.newDomains,
    r.error ?? "",
  );
  for (const e of (r.events || []).slice(0, 25)) {
    console.log(" ", e.kind, e.message);
  }
}

const gate = await db.collection("competitortransparencygates").find({}).toArray();
console.log("\n=== GATE ===", JSON.stringify(gate, null, 2));

await mongoose.disconnect();
