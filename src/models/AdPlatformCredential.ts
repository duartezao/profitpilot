import mongoose, { Schema } from "mongoose";

/** Refresh token OAuth partilhado no workspace — reutilizado em várias lojas. */
const AdPlatformCredentialSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["meta", "google", "tiktok"],
      required: true,
    },
    /** Email usado no OAuth (chave lógica por workspace). */
    loginEmail: { type: String, required: true, trim: true, lowercase: true },
    credentials: { type: String, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

AdPlatformCredentialSchema.index(
  { workspaceId: 1, platform: 1, loginEmail: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export type AdPlatformCredentialDoc = mongoose.InferSchemaType<
  typeof AdPlatformCredentialSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const AdPlatformCredential =
  (mongoose.models.AdPlatformCredential as mongoose.Model<AdPlatformCredentialDoc>) ||
  mongoose.model<AdPlatformCredentialDoc>(
    "AdPlatformCredential",
    AdPlatformCredentialSchema,
  );
