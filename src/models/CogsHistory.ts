import mongoose, { Schema } from "mongoose";

/** Versão histórica do custo de uma variante (manual ou Shopify). */
const CogsHistorySchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    variantId: { type: String, required: true, index: true },
    productId: { type: String },
    cost: { type: Number, required: true, min: 0 },
    source: { type: String, enum: ["shopify", "manual"], required: true },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
  },
  { timestamps: true },
);

CogsHistorySchema.index({ storeId: 1, variantId: 1, source: 1, effectiveFrom: -1 });

export type CogsHistoryDoc = mongoose.InferSchemaType<typeof CogsHistorySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CogsHistory =
  (mongoose.models.CogsHistory as mongoose.Model<CogsHistoryDoc>) ||
  mongoose.model<CogsHistoryDoc>("CogsHistory", CogsHistorySchema);
