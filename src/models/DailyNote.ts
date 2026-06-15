import mongoose, { Schema } from "mongoose";

const DailyNoteSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    storeId: { type: Schema.Types.ObjectId, ref: "Store", index: true },
    date: { type: Date, required: true, index: true },
    didScale: { type: Boolean, default: false },
    budgetChange: { type: Number },
    changeTags: { type: [String], default: [] },
    text: { type: String, trim: true, default: "" },
    mood: {
      type: String,
      enum: ["good", "bad", "neutral"],
    },
  },
  { timestamps: true },
);

DailyNoteSchema.index({ workspaceId: 1, date: -1 });
DailyNoteSchema.index({ workspaceId: 1, storeId: 1, date: 1 }, { unique: true });

export type DailyNoteDoc = mongoose.InferSchemaType<typeof DailyNoteSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DailyNote =
  (mongoose.models.DailyNote as mongoose.Model<DailyNoteDoc>) ||
  mongoose.model<DailyNoteDoc>("DailyNote", DailyNoteSchema);
