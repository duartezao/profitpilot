import mongoose, { Schema } from "mongoose";

const MembershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "editor", "viewer"],
      required: true,
    },
    // "all" ou array de ObjectId de lojas permitidas
    storeAccess: { type: Schema.Types.Mixed, default: "all" },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
    },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

MembershipSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });

export type MembershipDoc = mongoose.InferSchemaType<typeof MembershipSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Membership =
  (mongoose.models.Membership as mongoose.Model<MembershipDoc>) ||
  mongoose.model<MembershipDoc>("Membership", MembershipSchema);
