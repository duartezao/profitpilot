import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { Order } from "@/models/Order";
import { Workspace } from "@/models/Workspace";
import {
  computeOrderFees,
  ensureFeeSchedule,
  resolveFeeConfigForDateKey,
  type FeeScheduleEntry,
} from "@/lib/fee-schedule";
import { buildOrderAmountsBase } from "@/lib/order-money";
import { orderNetRevenue } from "@/lib/order-revenue";
import {
  dateKeyInTimezone,
  importDateKey,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import { parseDateInput } from "@/lib/period";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Recalcula taxas e amountsBase de todas as encomendas importadas (ignora preserve). */
export async function recalculateStoreOrderFees(
  storeId: string,
): Promise<number> {
  await connectToDatabase();
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const store = await Store.findById(storeOid).lean();
  if (!store) throw new Error("Loja não encontrada.");

  const workspace = await Workspace.findById(store.workspaceId)
    .select("baseCurrency")
    .lean();
  const baseCurrency = workspace?.baseCurrency ?? "EUR";
  const storeCurrency = (store.currency ?? "EUR").toUpperCase();
  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const floorKey =
    importDateKey(store.importStartDate, store.createdAt, tz) ??
    dateKeyInTimezone(new Date(store.createdAt ?? Date.now()), tz);

  const feeSchedule = ensureFeeSchedule(
    store.feeSchedule as FeeScheduleEntry[] | undefined,
    store.feeConfig,
    floorKey,
  );

  const orders = await Order.find({ storeId: storeOid })
    .select(
      "orderDate totalPrice subtotal refunded shipping cogs manualCogs",
    )
    .lean();

  let updated = 0;
  const bulk: mongoose.mongo.AnyBulkWriteOperation[] = [];

  for (const order of orders) {
    const orderDate = new Date(order.orderDate);
    const orderDateKey = dateKeyInTimezone(orderDate, tz);
    const feeConfig = resolveFeeConfigForDateKey(
      feeSchedule,
      store.feeConfig,
      orderDateKey,
      floorKey,
    );
    const totalPrice = num(order.totalPrice);
    const fees = computeOrderFees(totalPrice, feeConfig);
    const manualCogs = order.manualCogs ?? null;
    const cogsForBase = manualCogs != null ? manualCogs : num(order.cogs);
    const subtotal = num(order.subtotal);
    const refunded = num(order.refunded);
    const shipping = num(order.shipping);
    const netRevenue = orderNetRevenue({
      subtotal,
      totalPrice,
      refunded,
    });

    const amountsBase = await buildOrderAmountsBase(
      {
        subtotal,
        totalPrice,
        refunded,
        netRevenue,
        cogs: cogsForBase,
        shipping,
        fees,
      },
      storeCurrency,
      baseCurrency,
      orderDate,
      tz,
      manualCogs,
    );

    bulk.push({
      updateOne: {
        filter: { _id: order._id },
        update: { $set: { fees, amountsBase } },
      },
    });
    updated++;
  }

  if (bulk.length) {
    await Order.bulkWrite(bulk, { ordered: false });
  }

  return updated;
}

/** Remove encomendas anteriores à nova data de importação. */
export async function deleteOrdersBeforeImportDate(
  storeId: string,
  importStartDate: Date,
): Promise<number> {
  await connectToDatabase();
  const store = await Store.findById(storeId).select("ianaTimezone").lean();
  if (!store) throw new Error("Loja não encontrada.");
  const tz = normalizeStoreTimezone(store.ianaTimezone);
  const floorKey = dateKeyInTimezone(importStartDate, tz);
  const day = parseDateInput(floorKey);
  if (!day) return 0;
  day.setHours(0, 0, 0, 0);

  const result = await Order.deleteMany({
    storeId: new mongoose.Types.ObjectId(storeId),
    orderDate: { $lt: day },
  });
  return result.deletedCount;
}
