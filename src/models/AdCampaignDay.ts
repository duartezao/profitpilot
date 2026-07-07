import mongoose, { Schema } from "mongoose";

/** Métricas de uma campanha num dia (sync API). */
const AdCampaignDaySchema = new Schema(
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
      default: null,
    },
    platform: {
      type: String,
      enum: ["meta", "google", "tiktok"],
      required: true,
    },
    dateKey: { type: String, required: true, index: true },
    campaignId: { type: String, required: true, trim: true },
    campaignName: { type: String, trim: true, default: "" },
    spend: { type: Number, min: 0, default: 0 },
    currency: { type: String, default: "USD" },
    impressions: { type: Number, min: 0, default: 0 },
    clicks: { type: Number, min: 0, default: 0 },
    conversions: { type: Number, min: 0, default: 0 },
    /** Valor de conversão (receita atribuída) na moeda da conta. */
    conversionValue: { type: Number, min: 0, default: 0 },
    status: { type: String, trim: true, default: "" },
    statusLabel: { type: String, trim: true, default: "" },
    syncedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

/** Uma linha por conta API + campanha + dia — histórico preservado ao trocar de conta. */
AdCampaignDaySchema.index(
  { storeId: 1, adAccountId: 1, platform: 1, dateKey: 1, campaignId: 1 },
  { unique: true },
);

export type AdCampaignDayDoc = mongoose.InferSchemaType<
  typeof AdCampaignDaySchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const AdCampaignDay =
  (mongoose.models.AdCampaignDay as mongoose.Model<AdCampaignDayDoc>) ||
  mongoose.model<AdCampaignDayDoc>("AdCampaignDay", AdCampaignDaySchema);
