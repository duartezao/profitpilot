import mongoose, { Schema } from "mongoose";

/**
 * Idempotência de webhooks Shopify (`X-Shopify-Webhook-Id`).
 * Unique (storeId, webhookId) — retries não reprocessam.
 */
const WebhookEventSchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    webhookId: { type: String, required: true, trim: true },
    topic: { type: String, required: true, trim: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

WebhookEventSchema.index({ storeId: 1, webhookId: 1 }, { unique: true });

export type WebhookEventDoc = mongoose.InferSchemaType<
  typeof WebhookEventSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const WebhookEvent =
  (mongoose.models.WebhookEvent as mongoose.Model<WebhookEventDoc>) ||
  mongoose.model<WebhookEventDoc>("WebhookEvent", WebhookEventSchema);
