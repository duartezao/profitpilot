import mongoose, { Schema } from "mongoose";

const FeeConfigSchema = new Schema(
  {
    processingPercent: { type: Number, default: 0 },
    processingFixed: { type: Number, default: 0 },
    transactionFeePercent: { type: Number, default: 0 },
  },
  { _id: false },
);

const StoreSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    platform: {
      type: String,
      enum: ["shopify", "woocommerce"],
      default: "shopify",
    },
    shopDomain: { type: String, trim: true },
    /** Domínio público (.com) — apresentação e reports; API usa shopDomain. */
    displayUrl: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "paused", "archived"],
      default: "active",
    },
    currency: { type: String, default: "EUR" },
    groupTags: { type: [String], default: [] },
    // Blob encriptado (AES-256-GCM) com { clientId, clientSecret, accessToken }
    credentials: { type: String },
    scopes: { type: [String], default: [] },
    importStartDate: { type: Date },
    feeConfig: { type: FeeConfigSchema, default: () => ({}) },
    // Tesouraria (por loja): saldo inicial conhecido numa data, ponto de partida
    // para o "tenho € ou não?" desta loja.
    startingBalance: { type: Number, default: 0 },
    startingBalanceDate: { type: Date },
    lastSyncAt: { type: Date },
    // Sincronização automática.
    autoSync: { type: Boolean, default: true },
    syncIntervalMinutes: { type: Number, default: 240 },
    lastSyncError: { type: String, default: null },
    // Saldo atual do Shopify Payments (ainda por pagar).
    paymentsBalance: { type: Number, default: 0 },
    paymentsBalanceUpdatedAt: { type: Date },
    // Erro específico do sync de payouts (ex.: falta de scope).
    payoutsError: { type: String, default: null },
    // Filtro persistente de sessões Shopify — código ISO (ex. BE) ou null = todos.
    analyticsSessionCountry: { type: String, default: null },
    lastSessionMetricsAt: { type: Date },
    lastSessionMetricsError: { type: String, default: null },
    // Fuso IANA da loja (ex. Europe/Brussels) — dias de revenue/orders alinhados com Shopify.
    ianaTimezone: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type StoreDoc = mongoose.InferSchemaType<typeof StoreSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Store =
  (mongoose.models.Store as mongoose.Model<StoreDoc>) ||
  mongoose.model<StoreDoc>("Store", StoreSchema);
