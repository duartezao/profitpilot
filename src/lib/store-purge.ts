import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Order } from "@/models/Order";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { ManualCogsDay } from "@/models/ManualCogsDay";
import { EuCategoryFeeDay } from "@/models/EuCategoryFeeDay";
import { DailyNote } from "@/models/DailyNote";
import { CashEntry } from "@/models/CashEntry";
import { Expense } from "@/models/Expense";
import { Dispute } from "@/models/Dispute";
import { AdAccount } from "@/models/AdAccount";
import { AdCampaignDay } from "@/models/AdCampaignDay";
import { DailyMetric } from "@/models/DailyMetric";
import { Payout } from "@/models/Payout";
import { BalanceTransaction } from "@/models/BalanceTransaction";
import { SessionMetricsMonth } from "@/models/SessionMetricsMonth";
import { ProductCost } from "@/models/ProductCost";
import { CogsHistory } from "@/models/CogsHistory";
import { PriceHistory } from "@/models/PriceHistory";
import { Membership } from "@/models/Membership";
import { Store } from "@/models/Store";

export type StorePurgeCounts = {
  orders: number;
  manualAdSpend: number;
  manualCogsDays: number;
  euCategoryFeeDays: number;
  dailyNotes: number;
  cashEntries: number;
  payouts: number;
  balanceTransactions: number;
  sessionMetricsMonths: number;
  productCosts: number;
  cogsHistory: number;
  priceHistory: number;
  expenses: number;
  disputes: number;
  adAccounts: number;
  adCampaignDays: number;
  dailyMetrics: number;
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
    euCategoryFeeDays,
    dailyNotes,
    cashEntries,
    payouts,
    balanceTransactions,
    sessionMetricsMonths,
    productCosts,
    cogsHistory,
    priceHistory,
    expenses,
    disputes,
    adAccounts,
    adCampaignDays,
    dailyMetrics,
  ] = await Promise.all([
    Order.deleteMany({ storeId: storeOid }),
    ManualAdSpend.deleteMany({ storeId: storeOid }),
    ManualCogsDay.deleteMany({ storeId: storeOid }),
    EuCategoryFeeDay.deleteMany({ storeId: storeOid }),
    DailyNote.deleteMany({ storeId: storeOid }),
    CashEntry.deleteMany({ storeId: storeOid }),
    Payout.deleteMany({ storeId: storeOid }),
    BalanceTransaction.deleteMany({ storeId: storeOid }),
    SessionMetricsMonth.deleteMany({ storeId: storeOid }),
    ProductCost.deleteMany({ storeId: storeOid }),
    CogsHistory.deleteMany({ storeId: storeOid }),
    PriceHistory.deleteMany({ storeId: storeOid }),
    Expense.deleteMany({ storeId: storeOid }),
    Dispute.deleteMany({ storeId: storeOid }),
    AdAccount.deleteMany({ storeId: storeOid }),
    AdCampaignDay.deleteMany({ storeId: storeOid }),
    DailyMetric.deleteMany({ storeId: storeOid }),
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
    euCategoryFeeDays: euCategoryFeeDays.deletedCount,
    dailyNotes: dailyNotes.deletedCount,
    cashEntries: cashEntries.deletedCount,
    payouts: payouts.deletedCount,
    balanceTransactions: balanceTransactions.deletedCount,
    sessionMetricsMonths: sessionMetricsMonths.deletedCount,
    productCosts: productCosts.deletedCount,
    cogsHistory: cogsHistory.deletedCount,
    priceHistory: priceHistory.deletedCount,
    expenses: expenses.deletedCount,
    disputes: disputes.deletedCount,
    adAccounts: adAccounts.deletedCount,
    adCampaignDays: adCampaignDays.deletedCount,
    dailyMetrics: dailyMetrics.deletedCount,
  };
}
