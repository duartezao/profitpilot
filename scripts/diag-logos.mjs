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
  if (redirects > 5) return Promise.resolve({ err: "redirects", body: null, status: null });
  return new Promise((resolvePromise) => {
    const lib = url.startsWith("http:") ? http : https;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
        timeout: 20000,
        rejectUnauthorized: false,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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
            err: null,
            body,
            status: res.statusCode,
            len: body.length,
            shopify:
              body.includes("cdn.shopify.com") ||
              body.includes("Shopify.theme") ||
              body.includes("myshopify.com") ||
              body.includes("shopify-section") ||
              body.includes("Shopify.shop"),
            sample: body.slice(0, 200).replace(/\s+/g, " "),
          }),
        );
      },
    );
    req.on("error", (e) =>
      resolvePromise({ err: e.message, body: null, status: null }),
    );
    req.on("timeout", () => {
      req.destroy();
      resolvePromise({ err: "timeout", body: null, status: null });
    });
  });
}

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const logos = await db
  .collection("competitorcompanies")
  .findOne({ legalNameKey: "LOGOS ECOM LLC", deletedAt: null });
console.log("LOGOS", logos?._id, "seeds", logos?.seedHosts?.length, "storeCount", logos?.storeCount);

const domains = await db
  .collection("competitordomains")
  .find({ companyId: logos?._id, deletedAt: null })
  .project({ host: 1, isShopify: 1, discoverySource: 1 })
  .toArray();
console.log("\n=== DOMAINS LINKED TO LOGOS ===", domains.length);
for (const d of domains) console.log(" ", d.isShopify ? "OK" : "??", d.host, d.discoverySource);

const allShopify = await db
  .collection("competitordomains")
  .find({ deletedAt: null, isShopify: true })
  .project({ host: 1, companyId: 1 })
  .toArray();
console.log("\n=== ALL SHOPIFY DOMAINS ===", allShopify.length);
for (const d of allShopify) {
  const co = await db.collection("competitorcompanies").findOne({ _id: d.companyId });
  console.log(" ", d.host, "→", co?.legalName ?? "ORPHAN", co?.deletedAt ? "DEL" : "");
}

const probes = [
  ...(logos?.seedHosts || []).slice(0, 8),
  "lineabrava.es",
  "duneeden.com",
  "elisa-roma.it",
  "valeriamarbella.es",
];
console.log("\n=== PROBE FETCH ===");
for (const host of [...new Set(probes)]) {
  const r = await fetchText(`https://${host}`);
  console.log(
    host,
    r.err
      ? `ERR ${r.err}`
      : `HTTP ${r.status} len=${r.len} shopify=${r.shopify} :: ${r.sample?.slice(0, 80)}`,
  );
}

await mongoose.disconnect();
