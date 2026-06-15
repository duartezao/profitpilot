import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Order } from "@/models/Order";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { ManualCogsDay } from "@/models/ManualCogsDay";
import { DailyNote } from "@/models/DailyNote";
import { CashEntry } from "@/models/CashEntry";
import { Payout } from "@/models/Payout";
import { BalanceTransaction } from "@/models/BalanceTransaction";
import { SessionMetricsMonth } from "@/models/SessionMetricsMonth";
import { ProductCost } from "@/models/ProductCost";
import { CogsHistory } from "@/models/CogsHistory";
import { Membership } from "@/models/Membership";
import { Store } from "@/models/Store";

export type StorePurgeCounts = {
  orders: number;
  manualAdSpend: number;
  manualCogsDays: number;
  dailyNotes: number;
  cashEntries: number;
  payouts: number;
  balanceTransactions: number;
  sessionMetricsMonths: number;
  productCosts: number;
  cogsHistory: number;
};

/** Apaga todos os dados associados a uma loja e o documento da loja. */
export async function purgeStoreCompletely(
  storeId: string,
  workspaceId: string,
): Promise<StorePurgeCounts> {
  await connectToDatabase();
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const wsOid = new mongoose.Types.ObjectId(workspaceId);

  const [
    orders,
    manualAdSpend,
    manualCogsDays,
    dailyNotes,
    cashEntries,
    payouts,
    balanceTransactions,
    sessionMetricsMonths,
    productCosts,
    cogsHistory,
  ] = await Promise.all([
    Order.deleteMany({ storeId: storeOid }),
    ManualAdSpend.deleteMany({ storeId: storeOid }),
    ManualCogsDay.deleteMany({ storeId: storeOid }),
    DailyNote.deleteMany({ storeId: storeOid }),
    CashEntry.deleteMany({ storeId: storeOid }),
    Payout.deleteMany({ storeId: storeOid }),
    BalanceTransaction.deleteMany({ storeId: storeOid }),
    SessionMetricsMonth.deleteMany({ storeId: storeOid }),
    ProductCost.deleteMany({ storeId: storeOid }),
    CogsHistory.deleteMany({ storeId: storeOid }),
  ]);

  await Membership.updateMany(
    {
      workspaceId: wsOid,
      storeAccess: storeId,
    },
    { $pull: { storeAccess: storeId } },
  );

  await Store.deleteOne({ _id: storeOid, workspaceId: wsOid });

  return {
    orders: orders.deletedCount,
    manualAdSpend: manualAdSpend.deletedCount,
    manualCogsDays: manualCogsDays.deletedCount,
    dailyNotes: dailyNotes.deletedCount,
    cashEntries: cashEntries.deletedCount,
    payouts: payouts.deletedCount,
    balanceTransactions: balanceTransactions.deletedCount,
    sessionMetricsMonths: sessionMetricsMonths.deletedCount,
    productCosts: productCosts.deletedCount,
    cogsHistory: cogsHistory.deletedCount,
  };
}
