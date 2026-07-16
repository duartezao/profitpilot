import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Order } from "@/models/Order";
import { orderNetRevenue } from "@/lib/order-revenue";

/** Preenche `netRevenue` em orders antigas (antes do campo existir na BD). */
export async function backfillOrderNetRevenueForStore(
  storeId: mongoose.Types.ObjectId,
): Promise<number> {
  await connectToDatabase();

  const orders = await Order.find({
    storeId,
    $or: [{ netRevenue: { $exists: false } }, { netRevenue: null }],
  })
    .select("_id subtotal totalPrice refunded")
    .lean();

  if (orders.length === 0) return 0;

  await Order.bulkWrite(
    orders.map((o) => ({
      updateOne: {
        filter: { _id: o._id },
        update: {
          $set: {
            netRevenue: orderNetRevenue(o),
          },
        },
      },
    })),
  );

  return orders.length;
}

/**
 * Corrige REV inventada por edições Shopify: subtotal original > total actual
 * sem reembolso. Actualiza `subtotal`, `netRevenue` e `amountsBase.netRevenue`.
 */
export async function repairEditedOrderRevenueForStore(
  storeId: mongoose.Types.ObjectId,
): Promise<number> {
  await connectToDatabase();

  const orders = await Order.find({
    storeId,
    $expr: {
      $and: [
        { $gt: [{ $ifNull: ["$subtotal", 0] }, 0] },
        { $gt: [{ $ifNull: ["$totalPrice", 0] }, 0] },
        {
          $gt: [
            { $ifNull: ["$subtotal", 0] },
            { $add: [{ $ifNull: ["$totalPrice", 0] }, 0.009] },
          ],
        },
        { $lt: [{ $ifNull: ["$refunded", 0] }, 0.009] },
      ],
    },
  })
    .select("_id subtotal totalPrice refunded netRevenue amountsBase")
    .lean();

  if (!orders.length) return 0;

  await Order.bulkWrite(
    orders.map((o) => {
      const totalPrice = o.totalPrice ?? 0;
      const refunded = o.refunded ?? 0;
      const netRevenue = orderNetRevenue({
        subtotal: totalPrice,
        totalPrice,
        refunded,
      });
      const fx = o.amountsBase?.fxRate && o.amountsBase.fxRate > 0
        ? o.amountsBase.fxRate
        : 1;
      const amountsBase = {
        ...(o.amountsBase ?? {}),
        netRevenue: Math.round(netRevenue * fx * 100) / 100,
        fxRate: o.amountsBase?.fxRate ?? fx,
        baseCurrency: o.amountsBase?.baseCurrency ?? null,
      };
      return {
        updateOne: {
          filter: { _id: o._id },
          update: {
            $set: {
              subtotal: totalPrice,
              netRevenue,
              amountsBase,
            },
          },
        },
      };
    }),
  );

  return orders.length;
}
