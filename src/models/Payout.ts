import mongoose, { Schema } from "mongoose";

const PayoutSchema = new Schema(
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
    issuedAt: { type: Date, index: true },
    /** Quando o payout entrou na conta (status PAID). */
    paidAt: { type: Date, index: true },
    // SCHEDULED, IN_TRANSIT, PAID, FAILED, CANCELED…
    status: { type: String },
    net: { type: Number, default: 0 },
    // Taxas reais do Shopify Payments (charges + refunds + adjustments).
    fee: { type: Number, default: 0 },
    // Bruto das vendas incluídas no payout.
    gross: { type: Number, default: 0 },
    currency: { type: String, default: "EUR" },
  },
  { timestamps: true },
);

PayoutSchema.index({ storeId: 1, shopifyId: 1 }, { unique: true });

export type PayoutDoc = mongoose.InferSchemaType<typeof PayoutSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Payout =
  (mongoose.models.Payout as mongoose.Model<PayoutDoc>) ||
  mongoose.model<PayoutDoc>("Payout", PayoutSchema);
