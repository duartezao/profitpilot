import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mongoose from "mongoose";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 0) continue;
        const key = t.slice(0, i).trim();
        let val = t.slice(i + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    } catch {
      /* */
    }
  }
}

loadEnv();
await mongoose.connect(process.env.MONGODB_URI);
const cols = await mongoose.connection.db.listCollections().toArray();
const names = cols.map((c) => c.name).filter((n) => /competitor/i.test(n));
console.log("collections:", names.join(", ") || "(none)");
for (const n of names) {
  const c = mongoose.connection.db.collection(n);
  console.log(
    n,
    "total",
    await c.countDocuments(),
    "active",
    await c.countDocuments({ deletedAt: null }),
  );
  console.log(
    JSON.stringify(
      await c
        .find({})
        .limit(10)
        .project({ host: 1, legalName: 1, isShopify: 1, deletedAt: 1 })
        .toArray(),
      null,
      2,
    ),
  );
}
await mongoose.disconnect();
