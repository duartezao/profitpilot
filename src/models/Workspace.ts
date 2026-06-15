import mongoose, { Schema } from "mongoose";

const TargetsSchema = new Schema(
  {
    netMarginMin: { type: Number, default: 15 },
    refundRateMax: { type: Number, default: 5 },
    chargebackRateMax: { type: Number, default: 1 },
    poasMin: { type: Number, default: 1 },
  },
  { _id: false },
);

const WorkspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    baseCurrency: { type: String, default: "EUR" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    plan: {
      type: String,
      enum: ["free", "starter", "pro", "agency"],
      default: "free",
    },
    isolationMode: {
      type: String,
      enum: ["logical", "dedicated_db"],
      default: "logical",
    },
    refundWindowDays: { type: Number, default: 30 },
    // Reserva de impostos: política global aplicada à tesouraria de cada loja.
    taxReservePercent: { type: Number, default: 0 },
    targets: { type: TargetsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export type WorkspaceDoc = mongoose.InferSchemaType<typeof WorkspaceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Workspace =
  (mongoose.models.Workspace as mongoose.Model<WorkspaceDoc>) ||
  mongoose.model<WorkspaceDoc>("Workspace", WorkspaceSchema);
