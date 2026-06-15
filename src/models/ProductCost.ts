import mongoose, { Schema } from "mongoose";

/** Cache do custo por variante (COGS) vindo do "Cost per item" da Shopify. */
const ProductCostSchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    variantId: { type: String, required: true },
    productId: { type: String },
    title: { type: String },
    price: { type: Number, default: 0 },
    // Custo vindo da Shopify ("Cost per item").
    unitCost: { type: Number, default: 0 },
    // Custo manual (override). Tem prioridade sobre o da Shopify.
    manualCost: { type: Number, default: null },
    // A partir de quando o custo manual passa a valer (não mexe no passado).
    manualCostFrom: { type: Date, default: null },
    manualCostNote: { type: String, default: null },
    currency: { type: String, default: "EUR" },
  },
  { timestamps: true },
);

ProductCostSchema.index({ storeId: 1, variantId: 1 }, { unique: true });

export type ProductCostDoc = mongoose.InferSchemaType<
  typeof ProductCostSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const ProductCost =
  (mongoose.models.ProductCost as mongoose.Model<ProductCostDoc>) ||
  mongoose.model<ProductCostDoc>("ProductCost", ProductCostSchema);
