import mongoose, { Schema } from "mongoose";

const BalanceTransactionSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    shopifyId: { type: String, required: true },
    transactionDate: { type: Date, required: true, index: true },
    // PENDING, SCHEDULED, IN_TRANSIT, PAID…
    payoutStatus: { type: String, index: true },
    payoutShopifyId: { type: String },
    net: { type: Number, default: 0 },
    fee: { type: Number, default: 0 },
    type: { type: String },
    currency: { type: String, default: "EUR" },
  },
  { timestamps: true },
);

BalanceTransactionSchema.index({ storeId: 1, shopifyId: 1 }, { unique: true });
BalanceTransactionSchema.index({ storeId: 1, payoutStatus: 1, transactionDate: 1 });

export type BalanceTransactionDoc = mongoose.InferSchemaType<
  typeof BalanceTransactionSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const BalanceTransaction =
  (mongoose.models.BalanceTransaction as mongoose.Model<BalanceTransactionDoc>) ||
  mongoose.model<BalanceTransactionDoc>(
    "BalanceTransaction",
    BalanceTransactionSchema,
  );
