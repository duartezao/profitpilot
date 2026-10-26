import mongoose, { Schema } from "mongoose";

const CompetitorDomainSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    host: { type: String, required: true, index: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "CompetitorCompany",
      index: true,
      default: null,
    },
    brandName: { type: String, trim: true, default: null },
    /** ISO country; null = desconhecido / .com global. */
    country: { type: String, trim: true, default: null, index: true },
    isShopify: { type: Boolean, default: null },
    isActive: { type: Boolean, default: true },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    lastScannedAt: { type: Date, default: null },
    activeAdCount: { type: Number, default: 0 },
    advertisers: { type: [String], default: [] },
    discoverySource: {
      type: String,
      enum: ["seed", "impressum", "transparency", "manual", "loop"],
      default: "manual",
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CompetitorDomainSchema.index(
  { workspaceId: 1, host: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export type CompetitorDomainDoc = mongoose.InferSchemaType<
  typeof CompetitorDomainSchema
> & { _id: mongoose.Types.ObjectId };

export const CompetitorDomain =
  (mongoose.models.CompetitorDomain as mongoose.Model<CompetitorDomainDoc>) ||
  mongoose.model<CompetitorDomainDoc>(
    "CompetitorDomain",
    CompetitorDomainSchema,
  );
