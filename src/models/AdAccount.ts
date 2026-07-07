import mongoose, { Schema } from "mongoose";

const AdAccountSchema = new Schema(
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
    platform: {
      type: String,
      enum: ["meta", "google", "tiktok"],
      required: true,
    },
    externalAccountId: { type: String, required: true, trim: true },
    accountName: { type: String, trim: true, default: "" },
    /** Blob encriptado (AES-256-GCM) — ver app.md `adAccounts.credentials`. */
    credentials: { type: String, required: true },
    allocation: { type: Number, default: 100, min: 0, max: 100 },
    /** Fee fixa diária (na moeda da conta) somada ao gasto da API. */
    apiExtraFeeFixed: { type: Number, default: 0, min: 0 },
    /** % sobre o gasto da API (agência). */
    apiAgencyFeePercent: { type: Number, default: 0, min: 0, max: 100 },
    /** Email/conta usada no OAuth ao ligar (informativo). */
    linkedLoginEmail: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["active", "error", "disconnected"],
      default: "active",
    },
    lastSyncAt: { type: Date, default: null },
    lastSyncError: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

AdAccountSchema.index(
  { storeId: 1, platform: 1, externalAccountId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export type AdAccountDoc = mongoose.InferSchemaType<typeof AdAccountSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AdAccount =
  (mongoose.models.AdAccount as mongoose.Model<AdAccountDoc>) ||
  mongoose.model<AdAccountDoc>("AdAccount", AdAccountSchema);
