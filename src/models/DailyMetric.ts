import mongoose, { Schema } from "mongoose";

/** Snapshot imutável por loja e dia — escrito após sync (ontem). */
const DailyMetricSchema = new Schema(
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
    dateKey: { type: String, required: true, index: true },
    revenue: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    cogs: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    feesTotal: { type: Number, default: 0 },
    refunds: { type: Number, default: 0 },
    chargebacks: { type: Number, default: 0 },
    adSpend: { type: Number, default: 0 },
    adSpendMeta: { type: Number, default: 0 },
    adSpendGoogle: { type: Number, default: 0 },
    adSpendTiktok: { type: Number, default: 0 },
    operatingExpenses: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    margin: { type: Number, default: 0 },
    roas: { type: Number, default: null },
    poas: { type: Number, default: null },
    sessions: { type: Number, default: null },
    atcPct: { type: Number, default: null },
    cvrPct: { type: Number, default: null },
    /** Quando foi gravado — não actualizar depois. */
    snapshottedAt: { type: Date, required: true },
  },
  { timestamps: false },
);

DailyMetricSchema.index({ storeId: 1, dateKey: 1 }, { unique: true });

export type DailyMetricDoc = mongoose.InferSchemaType<typeof DailyMetricSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DailyMetric =
  (mongoose.models.DailyMetric as mongoose.Model<DailyMetricDoc>) ||
  mongoose.model<DailyMetricDoc>("DailyMetric", DailyMetricSchema);
