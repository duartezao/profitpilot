import mongoose, { Schema } from "mongoose";

const CreativeSchema = new Schema(
  {
    creativeId: { type: String, default: null },
    advertiserName: { type: String, default: null },
    advertiserVerified: { type: Boolean, default: false },
    format: { type: String, default: null },
    previewUrl: { type: String, default: null },
    landingUrl: { type: String, default: null },
    firstShown: { type: String, default: null },
    lastShown: { type: String, default: null },
    /** Regiões / países onde o ad foi visto (mundo). */
    regions: { type: [String], default: [] },
  },
  { _id: false },
);

const CompetitorAdSnapshotSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    domainId: {
      type: Schema.Types.ObjectId,
      ref: "CompetitorDomain",
      required: true,
      index: true,
    },
    host: { type: String, required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    advertiserName: { type: String, default: null },
    advertiserVerified: { type: Boolean, default: false },
    activeAdCount: { type: Number, default: 0 },
    creatives: { type: [CreativeSchema], default: [] },
    rawNote: { type: String, default: null },
  },
  { timestamps: true },
);

CompetitorAdSnapshotSchema.index(
  { workspaceId: 1, domainId: 1, dateKey: 1 },
  { unique: true },
);

export type CompetitorAdSnapshotDoc = mongoose.InferSchemaType<
  typeof CompetitorAdSnapshotSchema
> & { _id: mongoose.Types.ObjectId };

export const CompetitorAdSnapshot =
  (mongoose.models
    .CompetitorAdSnapshot as mongoose.Model<CompetitorAdSnapshotDoc>) ||
  mongoose.model<CompetitorAdSnapshotDoc>(
    "CompetitorAdSnapshot",
    CompetitorAdSnapshotSchema,
  );
