import mongoose, { Schema } from "mongoose";

const AdSpendLineSchema = new Schema(
  {
    platform: {
      type: String,
      enum: ["meta", "google", "tiktok"],
      required: true,
    },
    inputAmount: { type: Number, min: 0, default: 0 },
    inputCurrency: { type: String, default: "USD" },
    amount: { type: Number, min: 0, default: 0 },
    fxRate: { type: Number, default: null },
    /** Fee fixa (agência) na moeda base. */
    extraFee: { type: Number, min: 0, default: 0 },
    inputExtraFee: { type: Number, min: 0, default: null },
    /** % sobre o gasto em ads (valor introduzido). */
    agencyFeePercent: { type: Number, min: 0, max: 100, default: 0 },
    agencyFeeAmount: { type: Number, min: 0, default: 0 },
    inputAgencyFeeAmount: { type: Number, min: 0, default: null },
  },
  { _id: false },
);

/** Gasto em ads por dia e loja (manual ou API). */
const ManualAdSpendSchema = new Schema(
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
    /** Dia civil YYYY-MM-DD (timezone local do servidor). */
    dateKey: { type: String, required: true, index: true },
    /** Valor na moeda base do workspace (entra no lucro). */
    amount: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, default: "EUR" },
    /** Valor original introduzido pelo utilizador. */
    inputAmount: { type: Number, min: 0, default: null },
    inputCurrency: { type: String, default: null },
    /** Taxa de câmbio usada (input → base) no dia. */
    fxRate: { type: Number, default: null },
    /** Fee extra na moeda base (fixa + % agência), soma ao amount no lucro. */
    extraFee: { type: Number, min: 0, default: 0 },
    /** Fee extra original (soma das linhas, mesma moeda do gasto). */
    inputExtraFee: { type: Number, min: 0, default: null },
    /** Detalhe por plataforma (Meta, Google, TikTok). */
    lines: { type: [AdSpendLineSchema], default: [] },
    source: { type: String, enum: ["manual", "api"], default: "manual" },
    note: { type: String, trim: true, default: "" },
    /** Último utilizador que gravou (concorrência multi-user). */
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

ManualAdSpendSchema.index({ storeId: 1, dateKey: 1 }, { unique: true });

export type ManualAdSpendDoc = mongoose.InferSchemaType<
  typeof ManualAdSpendSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const ManualAdSpend =
  (mongoose.models.ManualAdSpend as mongoose.Model<ManualAdSpendDoc>) ||
  mongoose.model<ManualAdSpendDoc>("ManualAdSpend", ManualAdSpendSchema);
