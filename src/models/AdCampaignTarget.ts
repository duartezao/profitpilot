import mongoose, { Schema } from "mongoose";

/**
 * Destino de landing por campanha (agregado a partir dos ads).
 * Uma campanha com vários ads que partilham o mesmo URL → um registo.
 */
const AdCampaignTargetSchema = new Schema(
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
    campaignId: { type: String, required: true, trim: true },
    campaignName: { type: String, trim: true, default: "" },
    /** URLs de destino vistas nos ads desta campanha. */
    landingUrls: { type: [String], default: [] },
    /** Handles Shopify extraídos de /collections/{handle}. */
    collectionHandles: { type: [String], default: [] },
    /** Handles Shopify extraídos de /products/{handle}. */
    productHandles: { type: [String], default: [] },
    syncedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

AdCampaignTargetSchema.index(
  { storeId: 1, adAccountId: 1, platform: 1, campaignId: 1 },
  { unique: true },
);

export type AdCampaignTargetDoc = mongoose.InferSchemaType<
  typeof AdCampaignTargetSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const AdCampaignTarget =
  (mongoose.models.AdCampaignTarget as mongoose.Model<AdCampaignTargetDoc>) ||
  mongoose.model<AdCampaignTargetDoc>(
    "AdCampaignTarget",
    AdCampaignTargetSchema,
  );
