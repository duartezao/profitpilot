import mongoose, { Schema } from "mongoose";

const SessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Guardamos apenas o hash do token (nunca o token em claro).
    tokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String },
    ip: { type: String },
    // TTL: o MongoDB remove o documento automaticamente quando expira.
    // Workspace ativo nesta sessão (permite trocar entre vários workspaces).
    activeWorkspaceId: { type: Schema.Types.ObjectId, ref: "Workspace" },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

export type SessionDoc = mongoose.InferSchemaType<typeof SessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Session =
  (mongoose.models.Session as mongoose.Model<SessionDoc>) ||
  mongoose.model<SessionDoc>("Session", SessionSchema);
