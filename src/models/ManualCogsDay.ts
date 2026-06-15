import mongoose, { Schema } from "mongoose";

/** COGS total por dia e loja (modo «por dia»). */
const ManualCogsDaySchema = new Schema(
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
    /** Dia civil YYYY-MM-DD (fuso da loja). */
    dateKey: { type: String, required: true, index: true },
    /** Valor na moeda base do workspace. */
    amount: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, default: "EUR" },
    inputAmount: { type: Number, min: 0, default: null },
    inputCurrency: { type: String, default: null },
    fxRate: { type: Number, default: null },
    note: { type: String, trim: true, default: "" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

ManualCogsDaySchema.index({ storeId: 1, dateKey: 1 }, { unique: true });

export type ManualCogsDayDoc = mongoose.InferSchemaType<
  typeof ManualCogsDaySchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const ManualCogsDay =
  (mongoose.models.ManualCogsDay as mongoose.Model<ManualCogsDayDoc>) ||
  mongoose.model<ManualCogsDayDoc>("ManualCogsDay", ManualCogsDaySchema);
