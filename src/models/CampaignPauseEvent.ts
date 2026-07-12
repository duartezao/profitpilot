import mongoose, { Schema } from "mongoose";

/** Registo automático quando uma campanha passa a pausada (sync API). */
const CampaignPauseEventSchema = new Schema(
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
    /** Primeiro dia em que a pausa foi detetada. */
    dateKey: { type: String, required: true, index: true },
    /** Métricas da campanha nos dias com gasto antes da pausa. */
    preSpendDays: { type: Number, default: 0 },
    preSpend: { type: Number, default: 0 },
    preConversions: { type: Number, default: 0 },
    preRoas: { type: Number, default: null },
    /** Métricas da ad account (todas as campanhas) antes da pausa. */
    preAccountSpendDays: { type: Number, default: 0 },
    preAccountSpend: { type: Number, default: 0 },
    preAccountConversions: { type: Number, default: 0 },
    preAccountRoas: { type: Number, default: null },
    detectedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

CampaignPauseEventSchema.index(
  { storeId: 1, adAccountId: 1, platform: 1, campaignId: 1, dateKey: 1 },
  { unique: true },
);

export type CampaignPauseEventDoc = mongoose.InferSchemaType<
  typeof CampaignPauseEventSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const CampaignPauseEvent =
  (mongoose.models.CampaignPauseEvent as mongoose.Model<CampaignPauseEventDoc>) ||
  mongoose.model<CampaignPauseEventDoc>(
    "CampaignPauseEvent",
    CampaignPauseEventSchema,
  );
