import mongoose, { Schema } from "mongoose";

/** Versão histórica do preço de venda de uma variante (Shopify). */
const PriceHistorySchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    variantId: { type: String, required: true, index: true },
    productId: { type: String },
    price: { type: Number, required: true, min: 0 },
    source: { type: String, enum: ["shopify"], default: "shopify" },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
  },
  { timestamps: true },
);

PriceHistorySchema.index({ storeId: 1, variantId: 1, effectiveFrom: -1 });

export type PriceHistoryDoc = mongoose.InferSchemaType<
  typeof PriceHistorySchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const PriceHistory =
  (mongoose.models.PriceHistory as mongoose.Model<PriceHistoryDoc>) ||
  mongoose.model<PriceHistoryDoc>("PriceHistory", PriceHistorySchema);
