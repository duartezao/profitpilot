import mongoose, { Schema } from "mongoose";

const DiscoveryEventSchema = new Schema(
  {
    kind: {
      type: String,
      enum: [
        "company_found",
        "domain_found",
        "ads_updated",
        "link_created",
        "error",
        "info",
      ],
      required: true,
    },
    message: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, default: null },
    domainId: { type: Schema.Types.ObjectId, default: null },
    host: { type: String, default: null },
    legalName: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const CompetitorDiscoveryRunSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    trigger: {
      type: String,
      enum: ["manual", "cron", "seed"],
      default: "manual",
    },
    status: {
      type: String,
      enum: ["running", "ok", "error"],
      default: "running",
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    companiesScanned: { type: Number, default: 0 },
    domainsScanned: { type: Number, default: 0 },
    newCompanies: { type: Number, default: 0 },
    newDomains: { type: Number, default: 0 },
    events: { type: [DiscoveryEventSchema], default: [] },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

export type CompetitorDiscoveryRunDoc = mongoose.InferSchemaType<
  typeof CompetitorDiscoveryRunSchema
> & { _id: mongoose.Types.ObjectId };

export const CompetitorDiscoveryRun =
  (mongoose.models
    .CompetitorDiscoveryRun as mongoose.Model<CompetitorDiscoveryRunDoc>) ||
  mongoose.model<CompetitorDiscoveryRunDoc>(
    "CompetitorDiscoveryRun",
    CompetitorDiscoveryRunSchema,
  );