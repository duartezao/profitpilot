import mongoose, { Schema } from "mongoose";

const LineItemSchema = new Schema(
  {
    productId: { type: String },
    variantId: { type: String },
    title: { type: String },
    quantity: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    // COGS unitário (do "Cost per item" da Shopify); 0 se desconhecido.
    unitCost: { type: Number, default: 0 },
  },
  { _id: false },
);

const OrderSchema = new Schema(
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
    name: { type: String },
    orderDate: { type: Date, required: true, index: true },
    currency: { type: String, default: "EUR" },
    financialStatus: { type: String },

    // Valores monetários (na moeda da loja).
    totalPrice: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    /** Vendas líquidas (subtotal − reembolsos); calculado no sync. */
    netRevenue: { type: Number, default: 0 },
    discounts: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    refunded: { type: Number, default: 0 },

    // Calculados na sincronização.
    cogs: { type: Number, default: 0 },
    fees: { type: Number, default: 0 },

    lineItems: { type: [LineItemSchema], default: [] },
  },
  { timestamps: true },
);

// Uma order por loja (idempotente na sincronização).
OrderSchema.index({ storeId: 1, shopifyId: 1 }, { unique: true });

export type OrderDoc = mongoose.InferSchemaType<typeof OrderSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Order =
  (mongoose.models.Order as mongoose.Model<OrderDoc>) ||
  mongoose.model<OrderDoc>("Order", OrderSchema);
