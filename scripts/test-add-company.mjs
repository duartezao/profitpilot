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

function normalizeLegalName(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]+$/g, "")
    .toUpperCase();
}

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const ws = await db.collection("competitorcompanies").findOne(
  { deletedAt: null },
  { projection: { workspaceId: 1 } },
);
if (!ws) {
  console.error("no workspace");
  process.exit(1);
}

const name = "GRACA ENTERPRISES LLC";
const key = normalizeLegalName(name);

let doc = await db.collection("competitorcompanies").findOne({
  workspaceId: ws.workspaceId,
  legalNameKey: key,
});

if (doc) {
  await db.collection("competitorcompanies").updateOne(
    { _id: doc._id },
    {
      $set: {
        legalName: name,
        legalNameKey: key,
        deletedAt: null,
      },
    },
  );
  console.log("revived/updated", String(doc._id), name);
} else {
  const r = await db.collection("competitorcompanies").insertOne({
    workspaceId: ws.workspaceId,
    legalName: name,
    legalNameKey: key,
    entityId: null,
    registryCountry: null,
    notes: "",
    seedHosts: [],
    storeCount: 0,
    activeAdCount: 0,
    countries: [],
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log("created", String(r.insertedId), name);
}

const all = await db
  .collection("competitorcompanies")
  .find({ workspaceId: ws.workspaceId, deletedAt: null })
  .project({ legalName: 1, storeCount: 1 })
  .sort({ legalName: 1 })
  .toArray();
console.log(
  "companies",
  all.length,
  all.map((c) => c.legalName).join(" | "),
);

await mongoose.disconnect();
