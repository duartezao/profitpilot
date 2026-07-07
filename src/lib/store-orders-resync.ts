import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Order } from "@/models/Order";
import { Store } from "@/models/Store";
import { orderImportFloorDate } from "@/lib/order-sync-query";
import {
  dateKeyInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import { parseDateInput } from "@/lib/period";

export type OrdersResyncManualCogsMap = Record<string, number>;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Apaga encomendas desde importStartDate e guarda COGS manuais para restaurar após reimportação. */
export async function prepareStoreOrdersFullResync(storeId: string): Promise<{
  deletedCount: number;
  preservedManualCogs: number;
  manualCogsMap: OrdersResyncManualCogsMap;
}> {
  await connectToDatabase();
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const store = await Store.findById(storeOid)
    .select("importStartDate createdAt ianaTimezone syncState")
    .lean();
  if (!store) throw new Error("Loja não encontrada.");

  if (store.syncState?.status === "running") {
    throw new Error("Já há uma sincronização em curso nesta loja.");
  }

  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const floor = orderImportFloorDate(store);
  const floorKey = dateKeyInTimezone(floor, tz);
  const floorDay = parseDateInput(floorKey);
  if (!floorDay) throw new Error("Data de importação inválida.");
  floorDay.setHours(0, 0, 0, 0);

  const orders = await Order.find({
    storeId: storeOid,
    orderDate: { $gte: floorDay },
  })
    .select("shopifyId manualCogs")
    .lean();

  const manualCogsMap: OrdersResyncManualCogsMap = {};
  for (const order of orders) {
    if (order.manualCogs != null) {
      manualCogsMap[String(order.shopifyId)] = num(order.manualCogs);
    }
  }

  const result = await Order.deleteMany({
    storeId: storeOid,
    orderDate: { $gte: floorDay },
  });

  return {
    deletedCount: result.deletedCount,
    preservedManualCogs: Object.keys(manualCogsMap).length,
    manualCogsMap,
  };
}

/** Repõe COGS manuais após reimportação (custos por variante vêm da BD de COGS). */
export async function restoreStoreOrdersResyncManualCogs(
  storeId: string,
  manualCogsMap: OrdersResyncManualCogsMap | null | undefined,
): Promise<number> {
  if (!manualCogsMap || !Object.keys(manualCogsMap).length) return 0;

  await connectToDatabase();
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const bulk: mongoose.mongo.AnyBulkWriteOperation[] = [];

  for (const [shopifyId, manualCogs] of Object.entries(manualCogsMap)) {
    bulk.push({
      updateOne: {
        filter: { storeId: storeOid, shopifyId },
        update: { $set: { manualCogs } },
      },
    });
  }

  if (!bulk.length) return 0;
  const res = await Order.bulkWrite(bulk, { ordered: false });
  return res.modifiedCount;
}
