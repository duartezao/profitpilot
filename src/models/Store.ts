import mongoose, { Schema } from "mongoose";

const FeeConfigSchema = new Schema(
  {
    processingPercent: { type: Number, default: 0 },
    processingFixed: { type: Number, default: 0 },
    transactionFeePercent: { type: Number, default: 0 },
  },
  { _id: false },
);

const FeeScheduleEntrySchema = new Schema(
  {
    /** Dia civil YYYY-MM-DD (fuso da loja) — taxa aplica-se desde este dia. */
    effectiveFromKey: { type: String, required: true },
    processingPercent: { type: Number, default: 0 },
    processingFixed: { type: Number, default: 0 },
    transactionFeePercent: { type: Number, default: 0 },
  },
  { _id: false },
);

const SyncStateSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["idle", "running", "done", "error"],
      default: "idle",
    },
    phase: { type: String, default: null },
    progress: { type: Number, default: 0 },
    message: { type: String, default: "" },
    orderCursor: { type: String, default: null },
    orderPagesDone: { type: Number, default: 0 },
    ordersImported: { type: Number, default: 0 },
    productsImported: { type: Number, default: 0 },
    payoutsImported: { type: Number, default: 0 },
    balanceTransactionsImported: { type: Number, default: 0 },
    sessionDaysSynced: { type: Number, default: 0 },
    error: { type: String, default: null },
    resultSummary: { type: String, default: null },
    startedAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null },
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
    /** Estado na operação (pipeline) — independente de active/paused/archived. */
    operationStatus: {
      type: String,
      enum: ["running", "waiting", "killed"],
      default: null,
    },
    /** Dia em que passou a «matada» — métricas financeiras só até este dia (inclusive). */
    operationKilledAt: { type: Date, default: null },
    /** Dias por ciclo de teste de coleções (modo operação). */
    collectionTestCycleDays: { type: Number, default: 5, min: 1, max: 60 },
    /** Avisar N dias antes do fim do ciclo / início agendado. */
    collectionReminderDaysBefore: { type: Number, default: 2, min: 0, max: 14 },
    currency: { type: String, default: "EUR" },
    /** Como o COGS é preenchido nesta loja. */
    cogsMode: {
      type: String,
      enum: ["shopify", "variant", "order", "day"],
      default: "shopify",
    },
    /** Moeda usada na entrada manual de COGS (USD ou EUR). */
    cogsInputCurrency: {
      type: String,
      enum: ["EUR", "USD"],
      default: "EUR",
    },
    groupTags: { type: [String], default: [] },
    // Blob encriptado (AES-256-GCM) com { clientId, clientSecret, accessToken }
    credentials: { type: String },
    scopes: { type: [String], default: [] },
    importStartDate: { type: Date },
    feeConfig: { type: FeeConfigSchema, default: () => ({}) },
    /** Histórico de taxas — cada entrada vale a partir de `effectiveFromKey`. */
    feeSchedule: { type: [FeeScheduleEntrySchema], default: [] },
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
    // Origem do fuso: "shopify" (auto, sobrescrito no sync) ou "manual" (override do utilizador).
    timezoneSource: {
      type: String,
      enum: ["shopify", "manual"],
      default: "shopify",
    },
    /** Progresso do sync manual em passos (evita timeout em imports grandes). */
    syncState: { type: SyncStateSchema, default: () => ({ status: "idle" }) },
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
