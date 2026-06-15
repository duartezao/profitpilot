/**
 * Diagnóstico: REV de ontem no fuso da loja vs UTC/servidor.
 * Uso: npx tsx scripts/check-yesterday-rev.ts <storeId>
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createRequire } from "module";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

loadEnv();

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: "server-only",
  filename: "server-only",
  loaded: true,
  exports: {},
} as NodeModule;

const storeId = process.argv[2] ?? "6a2f3c90f28d6fea7e49ddf3";

async function main() {
  const { connectToDatabase } = await import("../src/lib/db");
  const { Store } = await import("../src/models/Store");
  const { Order } = await import("../src/models/Order");
  const {
    normalizeStoreTimezone,
    resolvePeriodForStore,
    orderDateMatchInTimezone,
    dateKeyInTimezone,
    zonedStartOfDay,
    zonedEndOfDay,
    addDaysToDateKey,
  } = await import("../src/lib/store-timezone");
  const { resolvePeriod, orderDateMatch } = await import("../src/lib/period");

  await connectToDatabase();
  const store = await Store.findById(storeId).lean();
  if (!store) {
    console.error("Loja não encontrada:", storeId);
    process.exit(1);
  }

  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const periodTz = resolvePeriodForStore({ period: "yesterday" }, tz);
  const periodSrv = resolvePeriod({ period: "yesterday" });

  console.log("Loja:", store.name);
  console.log("ianaTimezone (BD):", store.ianaTimezone ?? "(null → default)");
  console.log("TZ usado:", tz);
  console.log("");

  const matchTz = {
    storeId: store._id,
    ...orderDateMatchInTimezone(periodTz, tz),
  };
  const matchSrv = {
    storeId: store._id,
    ...orderDateMatch(periodSrv),
  };

  const [aggTz] = await Order.aggregate([
    { $match: matchTz },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$totalPrice" },
        orders: { $sum: 1 },
      },
    },
  ]);

  const [aggSrv] = await Order.aggregate([
    { $match: matchSrv },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$totalPrice" },
        orders: { $sum: 1 },
      },
    },
  ]);

  const yesterdayKey = addDaysToDateKey(dateKeyInTimezone(new Date(), tz), -1, tz);

  const [aggByDay] = await Order.aggregate([
    {
      $match: {
        storeId: store._id,
        orderDate: {
          $gte: zonedStartOfDay(yesterdayKey, tz),
          $lte: zonedEndOfDay(yesterdayKey, tz),
        },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$orderDate",
            timezone: tz,
          },
        },
        revenue: { $sum: "$totalPrice" },
        orders: { $sum: 1 },
      },
    },
  ]);

  console.log("Ontem (dia civil loja):", yesterdayKey);
  console.log("Período TZ:", periodTz.start.toISOString(), "→", periodTz.end.toISOString());
  console.log("Período servidor:", periodSrv.start.toISOString(), "→", periodSrv.end.toISOString());
  console.log("");
  console.log("REV ontem (fuso loja):", aggTz?.revenue ?? 0, `(${aggTz?.orders ?? 0} orders)`);
  console.log("REV ontem (servidor):", aggSrv?.revenue ?? 0, `(${aggSrv?.orders ?? 0} orders)`);
  console.log("REV por $dateToString:", aggByDay?.revenue ?? 0, `(${aggByDay?.orders ?? 0} orders)`);

  const sample = await Order.find(matchTz)
    .sort({ orderDate: -1 })
    .limit(5)
    .select("name orderDate totalPrice")
    .lean();

  console.log("\nÚltimas orders no período (fuso loja):");
  for (const o of sample) {
    const dk = dateKeyInTimezone(new Date(o.orderDate!), tz);
    console.log(
      `  ${o.name} | ${o.orderDate?.toISOString()} | dia=${dk} | ${o.totalPrice}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
