import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { DailyMetric } from "@/models/DailyMetric";
import { findStoreForUser } from "@/lib/store-scope";
import type { CurrentUser } from "@/lib/auth";

export type DailyMetricExportRow = {
  dateKey: string;
  revenue: number;
  orders: number;
  cogs: number;
  shippingCost: number;
  feesTotal: number;
  refunds: number;
  chargebacks: number;
  adSpend: number;
  operatingExpenses: number;
  netProfit: number;
  margin: number;
  roas: number | null;
  poas: number | null;
};

export async function listDailyMetricsForExport(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess">,
  storeId: string,
): Promise<{ storeName: string; rows: DailyMetricExportRow[] } | null> {
  await connectToDatabase();
  const store = await findStoreForUser(user, storeId, "name");
  if (!store) return null;

  const rows = await DailyMetric.find({
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    storeId: store._id,
  })
    .sort({ dateKey: -1 })
    .lean();

  return {
    storeName: store.name,
    rows: rows.map((r) => ({
      dateKey: r.dateKey,
      revenue: r.revenue,
      orders: r.orders,
      cogs: r.cogs,
      shippingCost: r.shippingCost,
      feesTotal: r.feesTotal,
      refunds: r.refunds,
      chargebacks: r.chargebacks,
      adSpend: r.adSpend,
      operatingExpenses: r.operatingExpenses,
      netProfit: r.netProfit,
      margin: r.margin,
      roas: r.roas ?? null,
      poas: r.poas ?? null,
    })),
  };
}
