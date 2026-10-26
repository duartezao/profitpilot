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

const name = process.argv[2] || "CAVALEIRUS LLC";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const runs = await mongoose.connection.db
    .collection("competitordiscoveryruns")
    .find({})
    .sort({ createdAt: -1 })
    .limit(2)
    .toArray();
  for (const r of runs) {
    console.log("\n=== RUN", r._id, r.status, r.trigger, "===");
    console.log({
      companiesScanned: r.companiesScanned,
      domainsScanned: r.domainsScanned,
      newCompanies: r.newCompanies,
      newDomains: r.newDomains,
      error: r.error,
    });
    for (const e of (r.events || []).slice(0, 30)) {
      console.log(`  [${e.kind}] ${e.message}`, e.meta?.note ?? "");
    }
  }

  const companies = await mongoose.connection.db
    .collection("competitorcompanies")
    .find({ deletedAt: null })
    .toArray();
  console.log(
    "\nActive companies:",
    companies.map((c) => ({
      name: c.legalName,
      seeds: c.seedHosts,
      stores: c.storeCount,
    })),
  );

  console.log("\n=== Transparency HTML fetch:", name, "===");
  const url = `https://adstransparency.google.com/?region=anywhere&text=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(25000),
  });
  console.log("HTML status", res.status, res.headers.get("content-type"));
  const html = await res.text();
  console.log("HTML len", html.length);
  const hostRe =
    /https?:\/\/(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)/gi;
  const hosts = new Set();
  for (const m of html.matchAll(hostRe)) hosts.add(m[1].toLowerCase());
  console.log("Hosts in HTML:", [...hosts].slice(0, 40));

  // Try a few RPC variants
  const payloads = [
    { "1": name, "2": 40, "3": { "1": 1 }, "7": { "1": 1 } },
    { "1": name, "2": 40, "3": { "12": 0 }, "7": { "1": 1 } },
    [["", name, null, null, null, null, [null, 40]]],
  ];
  for (let i = 0; i < payloads.length; i++) {
    const r = await fetch(
      "https://adstransparency.google.com/anji/_/rpc/SearchService/SearchCreatives?authuser=0",
      {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/json+protobuf",
          Accept: "*/*",
          Origin: "https://adstransparency.google.com",
          Referer: url,
          "x-same-domain": "1",
        },
        body: JSON.stringify(payloads[i]),
        signal: AbortSignal.timeout(20000),
      },
    );
    const text = await r.text();
    console.log(`\nRPC#${i} status`, r.status, "len", text.length);
    console.log(text.slice(0, 500));
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
