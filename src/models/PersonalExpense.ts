import mongoose, { Schema } from "mongoose";

/**
 * Despesas pessoais de membros do workspace (sócios).
 * NÃO entram no P&L / lucro da dashboard — só tracking interno.
 */
const PersonalExpenseSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    /** Membro a quem a despesa pertence. */
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dateKey: { type: String, required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },
    /** Valor na moeda base do workspace. */
    amountBase: { type: Number, required: true, min: 0 },
    deletedAt: { type: Date, default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

PersonalExpenseSchema.index({
  workspaceId: 1,
  userId: 1,
  dateKey: -1,
  deletedAt: 1,
});

export type PersonalExpenseDoc = mongoose.InferSchemaType<
  typeof PersonalExpenseSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const PersonalExpense =
  (mongoose.models.PersonalExpense as mongoose.Model<PersonalExpenseDoc>) ||
  mongoose.model<PersonalExpenseDoc>("PersonalExpense", PersonalExpenseSchema);
