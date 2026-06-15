import mongoose, { Schema } from "mongoose";

const CASH_ENTRY_TYPES = [
  "manual_in",
  "manual_out",
  "supplier_payable",
  "adjustment",
] as const;

/** Movimentos de caixa manuais (injeções de capital, levantamentos, etc.). */
const CashEntrySchema = new Schema(
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
    type: {
      type: String,
      enum: CASH_ENTRY_TYPES,
      required: true,
    },
    description: { type: String, trim: true, default: "" },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },
    /** Dia civil YYYY-MM-DD em que o dinheiro entrou/saiu da conta do negócio. */
    dueDateKey: { type: String, required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

CashEntrySchema.index({ workspaceId: 1, storeId: 1, dueDateKey: -1 });
CashEntrySchema.index({ storeId: 1, dueDateKey: -1, deletedAt: 1 });

export type CashEntryType = (typeof CASH_ENTRY_TYPES)[number];

export type CashEntryDoc = mongoose.InferSchemaType<typeof CashEntrySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CashEntry =
  (mongoose.models.CashEntry as mongoose.Model<CashEntryDoc>) ||
  mongoose.model<CashEntryDoc>("CashEntry", CashEntrySchema);
