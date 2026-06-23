import mongoose, { Schema } from "mongoose";

const OperationTaskSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    /** null = tarefa ao nível do workspace */
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      default: null,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["todo", "doing", "done"],
      default: "todo",
      index: true,
    },
    /** Ordenação dentro da coluna (menor = mais acima). */
    position: { type: Number, default: 0 },
    /** Lembrete / prazo (opcional). */
    dueDate: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

OperationTaskSchema.index({ workspaceId: 1, storeId: 1, status: 1, position: 1 });

export type OperationTaskDoc = mongoose.InferSchemaType<
  typeof OperationTaskSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const OperationTask =
  (mongoose.models.OperationTask as mongoose.Model<OperationTaskDoc>) ||
  mongoose.model<OperationTaskDoc>("OperationTask", OperationTaskSchema);
