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
