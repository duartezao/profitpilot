import mongoose, { Schema } from "mongoose";

const DisputeSchema = new Schema(
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
    initiatedAt: { type: Date, required: true, index: true },
    finalizedAt: { type: Date, default: null },
    status: { type: String, index: true },
    type: { type: String },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "EUR" },
    orderShopifyId: { type: String, default: null },
    orderName: { type: String, default: null },
    reason: { type: String, default: null },
  },
  { timestamps: true },
);

DisputeSchema.index({ storeId: 1, shopifyId: 1 }, { unique: true });
DisputeSchema.index({ storeId: 1, initiatedAt: -1 });

export type DisputeDoc = mongoose.InferSchemaType<typeof DisputeSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Dispute =
  (mongoose.models.Dispute as mongoose.Model<DisputeDoc>) ||
  mongoose.model<DisputeDoc>("Dispute", DisputeSchema);
