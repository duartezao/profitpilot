import mongoose, { Schema } from "mongoose";

const CompetitorLinkSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    fromType: {
      type: String,
      enum: ["company", "domain"],
      required: true,
    },
    fromId: { type: Schema.Types.ObjectId, required: true, index: true },
    toType: {
      type: String,
      enum: ["company", "domain"],
      required: true,
    },
    toId: { type: Schema.Types.ObjectId, required: true, index: true },
    kind: {
      type: String,
      enum: [
        "same_legal",
        "same_advertiser",
        "ads_landing",
        "suspected_cluster",
        "seed",
      ],
      required: true,
      index: true,
    },
    score: { type: Number, default: 1 },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

CompetitorLinkSchema.index(
  { workspaceId: 1, fromType: 1, fromId: 1, toType: 1, toId: 1, kind: 1 },
  { unique: true },
);

export type CompetitorLinkDoc = mongoose.InferSchemaType<
  typeof CompetitorLinkSchema
> & { _id: mongoose.Types.ObjectId };

export const CompetitorLink =
  (mongoose.models.CompetitorLink as mongoose.Model<CompetitorLinkDoc>) ||
  mongoose.model<CompetitorLinkDoc>("CompetitorLink", CompetitorLinkSchema);
