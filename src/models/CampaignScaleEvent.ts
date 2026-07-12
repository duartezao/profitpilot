import mongoose, { Schema } from "mongoose";

/** Registo automático quando o budget diário de uma campanha sobe (sync API). */
const CampaignScaleEventSchema = new Schema(
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
    adAccountId: {
      type: Schema.Types.ObjectId,
      ref: "AdAccount",
      required: true,
    },
    platform: {
      type: String,
      enum: ["meta", "google", "tiktok"],
      required: true,
    },
    campaignId: { type: String, required: true, trim: true },
    campaignName: { type: String, trim: true, default: "" },
    adAccountName: { type: String, trim: true, default: "" },
    dateKey: { type: String, required: true, index: true },
    previousBudget: { type: Number, required: true, min: 0 },
    newBudget: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },
    /** Métricas nos N dias com gasto imediatamente antes do scale. */
    preSpendDays: { type: Number, default: 0 },
    preSpend: { type: Number, default: 0 },
    preConversions: { type: Number, default: 0 },
    preRoas: { type: Number, default: null },
    detectedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

CampaignScaleEventSchema.index(
  { storeId: 1, adAccountId: 1, platform: 1, campaignId: 1, dateKey: 1 },
  { unique: true },
);

export type CampaignScaleEventDoc = mongoose.InferSchemaType<
  typeof CampaignScaleEventSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const CampaignScaleEvent =
  (mongoose.models.CampaignScaleEvent as mongoose.Model<CampaignScaleEventDoc>) ||
  mongoose.model<CampaignScaleEventDoc>(
    "CampaignScaleEvent",
    CampaignScaleEventSchema,
  );
