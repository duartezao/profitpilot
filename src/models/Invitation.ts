import mongoose, { Schema } from "mongoose";

const InvitationSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    email: { type: String, required: true, trim: true, lowercase: true },
    role: {
      type: String,
      enum: ["admin", "editor", "viewer"],
      required: true,
    },
    /** "all" = todas as lojas actuais e futuras; array = lojas específicas */
    storeAccess: { type: Schema.Types.Mixed, required: true },
    token: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "expired", "revoked"],
      default: "pending",
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

InvitationSchema.index(
  { workspaceId: 1, email: 1, status: 1 },
  { partialFilterExpression: { status: "pending" } },
);

export type InvitationDoc = mongoose.InferSchemaType<typeof InvitationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Invitation =
  (mongoose.models.Invitation as mongoose.Model<InvitationDoc>) ||
  mongoose.model<InvitationDoc>("Invitation", InvitationSchema);
