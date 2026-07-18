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

    /** displayFulfillmentStatus Shopify (normalizado). */
    fulfillmentStatus: { type: String, trim: true, default: null, index: true },

    /** cancelledAt da Shopify — sync reverte COGS/taxa UE se cancelada sem envio. */
    cancelledAt: { type: Date, default: null, index: true },

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
    /** `real` = Shopify Payments (balance transactions); `estimated` = fallback manual. */
    feesSource: {
      type: String,
      enum: ["real", "estimated"],
      default: null,
    },

    /** COGS manual por encomenda (modo «order»), na moeda base do workspace. */
    manualCogs: { type: Number, default: null },
    manualCogsInputAmount: { type: Number, default: null },
    manualCogsInputCurrency: { type: String, default: null },
    manualCogsFxRate: { type: Number, default: null },

    /** Valores convertidos para a moeda base do workspace (dashboard). */
    amountsBase: {
      netRevenue: { type: Number, default: null },
      cogs: { type: Number, default: null },
      shipping: { type: Number, default: null },
      fees: { type: Number, default: null },
      refunded: { type: Number, default: null },
      fxRate: { type: Number, default: null },
      baseCurrency: { type: String, default: null },
    },

    /** País de envio ISO2 (Shopify shippingAddress.countryCodeV2). */
    shippingCountryCode: { type: String, trim: true, default: null, index: true },

    lineItems: { type: [LineItemSchema], default: [] },
  },
  { timestamps: true },
);

// Uma order por loja (idempotente na sincronização).
OrderSchema.index({ storeId: 1, shopifyId: 1 }, { unique: true });
// Agregações por loja + período (dashboard, gráficos, exports).
OrderSchema.index({ storeId: 1, orderDate: 1 });
OrderSchema.index({ workspaceId: 1, orderDate: 1 });
// Revisão SSE / latestUpdatedAt por workspace.
OrderSchema.index({ workspaceId: 1, updatedAt: -1 });

export type OrderDoc = mongoose.InferSchemaType<typeof OrderSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Order =
  (mongoose.models.Order as mongoose.Model<OrderDoc>) ||
  mongoose.model<OrderDoc>("Order", OrderSchema);
