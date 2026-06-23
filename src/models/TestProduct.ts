import mongoose, { Schema } from "mongoose";

const TestProductSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    collectionName: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["testing", "tested", "winner", "failed"],
      default: "testing",
    },
    notes: { type: String, trim: true, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TestProductSchema.index(
  { workspaceId: 1, storeId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export type TestProductDoc = mongoose.InferSchemaType<
  typeof TestProductSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const TestProduct =
  (mongoose.models.TestProduct as mongoose.Model<TestProductDoc>) ||
  mongoose.model<TestProductDoc>("TestProduct", TestProductSchema);
