/**
 * Religa domains Shopify a empresas canónicas (CAVALEIRUS LLC, etc.)
 * e atualiza storeCount / ads.
 */
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

/** host → legalNameKey preferido (quando Impressum já foi visto) */
const HOST_COMPANY = {
  "eloise-newyork.com": "CAVALEIRUS LLC",
  "modehaus-caroline.de": "CAVALEIRUS LLC",
  "claragraz.at": "CAVALEIRUS LLC",
  "islaedinburgh.com": "UNIFYPULSE LLC",
  "brigitte-wien.at": "CAVALEIRUS LLC",
};

loadEnv();
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const companies = await db
  .collection("competitorcompanies")
  .find({ deletedAt: null })
  .toArray();
const byKey = new Map(
  companies.map((c) => [String(c.legalNameKey || c.legalName).toUpperCase(), c]),
);

const domains = await db
  .collection("competitordomains")
  .find({ deletedAt: null, isShopify: true })
  .toArray();

let fixed = 0;
for (const d of domains) {
  const prefer = HOST_COMPANY[d.host];
  let target = prefer ? byKey.get(prefer) : null;

  if (!target && d.companyId) {
    const linked = await db.collection("competitorcompanies").findOne({
      _id: d.companyId,
    });
    if (linked?.deletedAt) {
      // empresa lixo — tentar extrair canónico do nome
      const name = String(linked.legalName || "").toUpperCase();
      if (name.includes("CAVALEIRUS")) target = byKey.get("CAVALEIRUS LLC");
      else if (name.includes("UNIFYPULSE")) target = byKey.get("UNIFYPULSE LLC");
    } else if (linked && !linked.deletedAt) {
      target = linked;
    }
  }

  if (!target) {
    console.log("skip (no company)", d.host);
    continue;
  }

  if (String(d.companyId) !== String(target._id)) {
    await db
      .collection("competitordomains")
      .updateOne({ _id: d._id }, { $set: { companyId: target._id } });
    console.log("link", d.host, "→", target.legalName);
    fixed++;
  } else {
    console.log("ok  ", d.host, "→", target.legalName);
  }
}

// aggregates
for (const c of companies) {
  const ds = await db
    .collection("competitordomains")
    .find({ companyId: c._id, deletedAt: null, isShopify: true })
    .toArray();
  const countries = [
    ...new Set(ds.map((x) => x.country).filter(Boolean)),
  ].sort();
  const activeAdCount = ds.reduce((s, x) => s + (x.activeAdCount ?? 0), 0);
  await db.collection("competitorcompanies").updateOne(
    { _id: c._id },
    {
      $set: {
        storeCount: ds.length,
        activeAdCount,
        countries,
      },
    },
  );
  console.log(
    "agg",
    c.legalName,
    "stores=",
    ds.length,
    "ads=",
    activeAdCount,
    countries,
  );
}

console.log("\nfixed links:", fixed);
await mongoose.disconnect();
