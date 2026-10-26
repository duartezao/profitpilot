import mongoose, { Schema } from "mongoose";

const CompetitorCompanySchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    legalName: { type: String, required: true, trim: true },
    legalNameKey: { type: String, required: true, index: true },
    entityId: { type: String, trim: true, default: null },
    registryCountry: { type: String, trim: true, default: null },
    notes: { type: String, trim: true, default: "" },
    seedHosts: { type: [String], default: [] },
    lastScannedAt: { type: Date, default: null },
    storeCount: { type: Number, default: 0 },
    activeAdCount: { type: Number, default: 0 },
    /** Países onde tem lojas (ISO), mundo inteiro. */
    countries: { type: [String], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CompetitorCompanySchema.index(
  { workspaceId: 1, legalNameKey: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export type CompetitorCompanyDoc = mongoose.InferSchemaType<
  typeof CompetitorCompanySchema
> & { _id: mongoose.Types.ObjectId };

export const CompetitorCompany =
  (mongoose.models
    .CompetitorCompany as mongoose.Model<CompetitorCompanyDoc>) ||
  mongoose.model<CompetitorCompanyDoc>(
    "CompetitorCompany",
    CompetitorCompanySchema,
  );
