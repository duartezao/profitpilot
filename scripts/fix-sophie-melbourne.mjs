import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import http from "node:http";
import https from "node:https";
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

function fetchText(url, redirects = 0) {
  if (redirects > 5) return Promise.resolve(null);
  return new Promise((resolvePromise) => {
    const lib = url.startsWith("http:") ? http : https;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 Chrome/131.0.0.0",
          Accept: "text/html",
        },
        timeout: 18000,
        rejectUnauthorized: false,
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          void fetchText(next, redirects + 1).then(resolvePromise);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolvePromise({
            status: res.statusCode,
            len: body.length,
            shop: /cdn.shopify.com|Shopify.theme|myshopify|shopify-section/.test(
              body,
            ),
          }),
        );
      },
    );
    req.on("error", (e) => resolvePromise({ err: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolvePromise({ err: "timeout" });
    });
  });
}

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const logos = await db
  .collection("competitorcompanies")
  .findOne({ legalNameKey: "LOGOS ECOM LLC", deletedAt: null });

await db
  .collection("competitorcompanies")
  .updateOne(
    { _id: logos._id },
    { $pull: { seedHosts: "sophie-melbourne.com" } },
  );
await db
  .collection("competitorcompanies")
  .updateOne(
    { _id: logos._id },
    { $addToSet: { seedHosts: "sophiemelbourne.com" } },
  );

for (const host of ["sophie-melbourne.com", "sophiemelbourne.com"]) {
  const r = await fetchText(`https://${host}`);
  console.log(host, r.err || `HTTP ${r.status} len=${r.len} shopify=${r.shop}`);
  if (r.shop) {
    await db.collection("competitordomains").updateOne(
      { workspaceId: logos.workspaceId, host },
      {
        $setOnInsert: {
          workspaceId: logos.workspaceId,
          host,
          firstSeenAt: new Date(),
          discoverySource: "seed",
        },
        $set: {
          companyId: logos._id,
          isShopify: true,
          isActive: true,
          country: "AU",
          lastSeenAt: new Date(),
        },
        $unset: { deletedAt: "" },
      },
      { upsert: true },
    );
    console.log("linked", host);
  }
}

const domains = await db
  .collection("competitordomains")
  .find({ companyId: logos._id, deletedAt: null })
  .project({ host: 1 })
  .toArray();
await db
  .collection("competitorcompanies")
  .updateOne({ _id: logos._id }, { $set: { storeCount: domains.length } });
console.log(
  "LOGOS stores",
  domains.length,
  domains.map((d) => d.host),
);
await mongoose.disconnect();
