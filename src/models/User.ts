import mongoose, { Schema } from "mongoose";

const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String }, // encriptado (AES-256-GCM)
  },
  { timestamps: true },
);

export type UserDoc = mongoose.InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const User =
  (mongoose.models.User as mongoose.Model<UserDoc>) ||
  mongoose.model<UserDoc>("User", UserSchema);
