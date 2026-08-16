import mongoose, { Schema } from "mongoose";
import {
  ACCESS_VAULT_CATEGORIES,
  type AccessVaultCategory,
} from "@/lib/access-vault";

export type { AccessVaultCategory };
export { ACCESS_VAULT_CATEGORIES };

/** Credenciais partilhadas no workspace (encriptadas em repouso). */
const WorkspaceAccessCredentialSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    /** Loja associada (opcional). */
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      default: null,
      index: true,
    },
    category: {
      type: String,
      enum: ACCESS_VAULT_CATEGORIES,
      required: true,
    },
    title: { type: String, trim: true, required: true, maxlength: 120 },
    /** Utilizador / email — encriptado (AES-256-GCM). */
    usernameEncrypted: { type: String, default: "" },
    /** Palavra-passe — encriptada (AES-256-GCM). */
    passwordEncrypted: { type: String, required: true },
    url: { type: String, trim: true, default: "", maxlength: 500 },
    /** Notas internas — encriptadas. */
    notesEncrypted: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

WorkspaceAccessCredentialSchema.index({
  workspaceId: 1,
  category: 1,
  deletedAt: 1,
});

export type WorkspaceAccessCredentialDoc =
  mongoose.InferSchemaType<typeof WorkspaceAccessCredentialSchema> & {
    _id: mongoose.Types.ObjectId;
  };

export const WorkspaceAccessCredential =
  (mongoose.models
    .WorkspaceAccessCredential as mongoose.Model<WorkspaceAccessCredentialDoc>) ||
  mongoose.model<WorkspaceAccessCredentialDoc>(
    "WorkspaceAccessCredential",
    WorkspaceAccessCredentialSchema,
  );
