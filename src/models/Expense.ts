import mongoose, { Schema } from "mongoose";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_FREQUENCIES,
  type ExpenseCategory,
  type ExpenseFrequency,
} from "@/lib/expense-constants";

export { EXPENSE_CATEGORIES, EXPENSE_FREQUENCIES };
export type { ExpenseCategory, ExpenseFrequency };

/** Custos fixos, apps, subscrições e outros gastos operacionais. */
const ExpenseSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    /** Vazio = gasto ao nível do workspace (todas as lojas no consolidado). */
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: EXPENSE_CATEGORIES,
      default: "other",
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },
    /** Valor convertido para a moeda base do workspace. */
    amountBase: { type: Number, required: true, min: 0 },
    frequency: {
      type: String,
      enum: EXPENSE_FREQUENCIES,
      default: "monthly",
    },
    recurring: { type: Boolean, default: true },
    startDateKey: { type: String, required: true, index: true },
    endDateKey: { type: String, default: null },
    deletedAt: { type: Date, default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

ExpenseSchema.index({ workspaceId: 1, storeId: 1, deletedAt: 1 });

export type ExpenseDoc = mongoose.InferSchemaType<typeof ExpenseSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Expense =
  (mongoose.models.Expense as mongoose.Model<ExpenseDoc>) ||
  mongoose.model<ExpenseDoc>("Expense", ExpenseSchema);
