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

const NOISE =
  /\b(ADDRESS|REGISTERED|BUSINESS|STREET|SUITE|STE|CASPER|WYOMING|HANDELSNAME|IST\s+EIN|MODEHAUS|TRADE\s+NAME|TRADEMARK|RABATT|VERSAND|GRATIS|POST|EXTRA|CKGABERECH|MEDIENG|@MEDIA|INFORMATION|ELOISE|VIEW\s*ALL|PRODUCTS|NAMES\s+ARE|WENDOUGEE|OCTOBER|COMPANY\s+INFORMATION)\b/i;

function normalize(name) {
  return name.trim().replace(/\s+/g, " ").replace(/[.,]+$/g, "").toUpperCase();
}

function isNoise(name) {
  const key = normalize(name);
  if (key.length < 5 || key.length > 60) return true;
  if (!/\b(LLC|INC|GMBH|LTD|LIMITED|AB|SAS|SARL|OY|B\.?V\.?|S\.?A\.?)$/i.test(key))
    return true;
  if (key.split(/\s+/).length > 5) return true;
  if (NOISE.test(key)) return true;
  if (/^ECOM\s+LLC$/i.test(key)) return true;
  return false;
}

function extractCanonical(raw) {
  const key = normalize(raw);
  const m = [
    ...key.matchAll(
      /\b(LLC|L\.L\.C\.|LIMITED|LTD\.?|INC\.?|GMBH|S\.?A\.?|S\.?L\.?|B\.?V\.?|SAS|SARL|OY|AB|PTY\s+LTD)\b/g,
    ),
  ];
  if (!m.length) return null;
  const last = m[m.length - 1];
  const before = key.slice(0, last.index).trim().split(/\s+/).filter(Boolean);
  for (let n = 1; n <= 3; n++) {
    if (before.length < n) break;
    const part = before.slice(-n).join(" ");
    if (
      /^(OF|DER|DES|THE|A|AN|AND|UND|EIN|EINE|NAME|TRADE|FOR|MIT|VON)$/.test(
        part.split(/\s+/).pop() ?? "",
      )
    )
      continue;
    const cand = normalize(`${part} ${last[0]}`);
    if (!isNoise(cand)) return cand;
  }
  return null;
}

const cos = await db.collection("competitorcompanies").find({}).toArray();
let soft = 0;
const canonicalIds = new Map();

for (const c of cos) {
  if (c.deletedAt) continue;
  if (!isNoise(c.legalName)) {
    canonicalIds.set(normalize(c.legalName), c._id);
    continue;
  }
  const can = extractCanonical(c.legalName);
  if (can && !canonicalIds.has(can)) {
    // ensure canonical exists
    const existing = cos.find(
      (x) => !x.deletedAt && normalize(x.legalName) === can,
    );
    if (existing) canonicalIds.set(can, existing._id);
    else {
      const key = can;
      const inserted = await db.collection("competitorcompanies").insertOne({
        workspaceId: c.workspaceId,
        legalName: can,
        legalNameKey: key,
        seedHosts: [],
        countries: [],
        storeCount: 0,
        activeAdCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      canonicalIds.set(can, inserted.insertedId);
      console.log("created canonical", can);
    }
  }
  if (can && canonicalIds.has(can)) {
    const r = await db.collection("competitordomains").updateMany(
      { companyId: c._id, deletedAt: null },
      { $set: { companyId: canonicalIds.get(can) } },
    );
    if (r.modifiedCount)
      console.log("relinked", r.modifiedCount, "from", c.legalName, "→", can);
  }
  await db
    .collection("competitorcompanies")
    .updateOne({ _id: c._id }, { $set: { deletedAt: new Date() } });
  soft++;
  console.log("soft-del", c.legalName);
}

// Known host → company
const hostMap = {
  "eloise-newyork.com": "CAVALEIRUS LLC",
  "modehaus-caroline.de": "CAVALEIRUS LLC",
  "claragraz.at": "CAVALEIRUS LLC",
  "islaedinburgh.com": "UNIFYPULSE LLC",
  "espressooutlet.com": "ESPRESSO OUTLET LLC",
};

for (const [host, legal] of Object.entries(hostMap)) {
  let id = canonicalIds.get(legal);
  if (!id) {
    const found = await db
      .collection("competitorcompanies")
      .findOne({ legalNameKey: legal, deletedAt: null });
    if (found) id = found._id;
    else {
      const cos0 = cos[0];
      const ins = await db.collection("competitorcompanies").insertOne({
        workspaceId: cos0?.workspaceId,
        legalName: legal,
        legalNameKey: legal,
        seedHosts: [],
        countries: [],
        storeCount: 0,
        activeAdCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      id = ins.insertedId;
    }
    canonicalIds.set(legal, id);
  }
  await db.collection("competitordomains").updateOne(
    { host },
    {
      $set: { companyId: id, isShopify: true, isActive: true },
      $unset: { deletedAt: "" },
    },
  );
  console.log("force", host, "→", legal);
}

// refresh store counts
for (const [legal, id] of canonicalIds) {
  const domains = await db
    .collection("competitordomains")
    .find({ companyId: id, deletedAt: null, isShopify: true })
    .toArray();
  await db.collection("competitorcompanies").updateOne(
    { _id: id },
    {
      $set: {
        storeCount: domains.length,
        activeAdCount: domains.reduce((s, d) => s + (d.activeAdCount || 0), 0),
        deletedAt: null,
      },
      $unset: {},
    },
  );
  if (domains.length)
    console.log(legal, "stores=", domains.length, domains.map((d) => d.host));
}

console.log("done soft-deleted", soft);
await mongoose.disconnect();
