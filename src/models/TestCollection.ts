import mongoose, { Schema } from "mongoose";

const TestCollectionSchema = new Schema(
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
    status: {
      type: String,
      enum: ["queue", "testing", "skipped", "winner", "failed"],
      default: "queue",
    },
    notes: { type: String, trim: true, default: "" },
    /** Início planeado do teste (fila). */
    scheduledStartDate: { type: Date, default: null },
    /** Quando passou a «a testar». */
    testStartedAt: { type: Date, default: null },
    /** Fim do ciclo (início + N dias). */
    testEndsAt: { type: Date, default: null },
    /** Dias do ciclo (override da loja). */
    cycleDays: { type: Number, default: null, min: 1, max: 60 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TestCollectionSchema.index(
  { workspaceId: 1, storeId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export type TestCollectionDoc = mongoose.InferSchemaType<
  typeof TestCollectionSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const TestCollection =
  (mongoose.models.TestCollection as mongoose.Model<TestCollectionDoc>) ||
  mongoose.model<TestCollectionDoc>("TestCollection", TestCollectionSchema);
