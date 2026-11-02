/**
 * Reconverte amountsBase quando order.currency ≠ moeda base mas fxRate ficou 1
 * (bug: usava store.currency em vez da moeda da encomenda).
 *
 * Uso: node scripts/backfill-order-fx.mjs
 */
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

const FALLBACK_TO_EUR = {
  USD: 0.92,
  GBP: 1.17,
  AUD: 0.6,
  CAD: 0.67,
  RSD: 0.0085,
};

const rateCache = new Map();

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function dateKeyUTC(d) {
  return new Date(d).toISOString().slice(0, 10);
}

async function fetchRate(from, to, dateKey) {
  const key = `${dateKey}:${from}:${to}`;
  if (rateCache.has(key)) return rateCache.get(key);
  if (from === to) {
    rateCache.set(key, 1);
    return 1;
  }
  try {
    const url = `https://api.frankfurter.app/${dateKey}?from=${from}&to=${to}`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const rate = json.rates?.[to];
      if (typeof rate === "number") {
        rateCache.set(key, rate);
        return rate;
      }
    }
  } catch {
    /* */
  }
  try {
    const fromLc = from.toLowerCase();
    const toLc = to.toLowerCase();
    const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateKey}/v1/currencies/${fromLc}.json`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const rate = json[fromLc]?.[toLc];
      if (typeof rate === "number") {
        rateCache.set(key, rate);
        return rate;
      }
    }
  } catch {
    /* */
  }
  if (to === "EUR" && FALLBACK_TO_EUR[from] != null) {
    return FALLBACK_TO_EUR[from];
  }
  throw new Error(`Sem taxa ${from}→${to} @ ${dateKey}`);
}

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const cursor = db.collection("orders").find({
  deletedAt: null,
  currency: { $exists: true, $nin: [null, ""] },
  $or: [
    { "amountsBase.fxRate": 1 },
    { "amountsBase.fxRate": { $exists: false } },
    { amountsBase: { $exists: false } },
  ],
});

let scanned = 0;
let fixed = 0;
let skipped = 0;
let errors = 0;

while (await cursor.hasNext()) {
  const o = await cursor.next();
  scanned++;
  const from = String(o.currency || "").toUpperCase();
  const to = String(o.amountsBase?.baseCurrency || "EUR").toUpperCase();
  if (!from || from === to) {
    skipped++;
    continue;
  }
  // Só corrige quando estava claramente sem conversão
  const fx = o.amountsBase?.fxRate;
  if (fx != null && Math.abs(fx - 1) > 0.0001) {
    skipped++;
    continue;
  }

  try {
    const dk = dateKeyUTC(o.orderDate || o.createdAt || new Date());
    const rate = await fetchRate(from, to, dk);
    const net = Number(o.netRevenue) || 0;
    const cogs = Number(o.manualCogs ?? o.cogs) || 0;
    const shipping = Number(o.shipping) || 0;
    const fees = Number(o.fees) || 0;
    const refunded = Number(o.refunded) || 0;
    await db.collection("orders").updateOne(
      { _id: o._id },
      {
        $set: {
          amountsBase: {
            netRevenue: roundMoney(net * rate),
            cogs: roundMoney(cogs * rate),
            shipping: roundMoney(shipping * rate),
            fees: roundMoney(fees * rate),
            refunded: roundMoney(refunded * rate),
            fxRate: rate,
            baseCurrency: to,
          },
        },
      },
    );
    fixed++;
    if (fixed % 25 === 0) {
      console.log(`fixed ${fixed} (scanned ${scanned})`);
    }
  } catch (e) {
    errors++;
    console.warn("fail", o.name, from, e.message);
  }
}

console.log({ scanned, fixed, skipped, errors });
await mongoose.disconnect();
