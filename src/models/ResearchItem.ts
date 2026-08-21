import mongoose, { Schema } from "mongoose";

const ResearchItemSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    /** product | collection */
    kind: {
      type: String,
      enum: ["product", "collection"],
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    reach: { type: Number, min: 0, default: null },
    activeDays: { type: Number, min: 0, default: null },
    fbAdLink: { type: String, trim: true, default: "" },
    storeLink: { type: String, trim: true, default: "" },
    market: { type: String, trim: true, default: "" },
    /** Data da research (auto no create; editável depois). */
    researchedAt: { type: Date, required: true, index: true },
    gender: {
      type: String,
      enum: ["female", "male", "unisex", "unknown"],
      default: "unknown",
      index: true,
    },
    notes: { type: String, trim: true, default: "" },
    /** Ângulo / hook do anúncio (opcional). */
    angle: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["new", "shortlist", "testing", "winner", "rejected"],
      default: "new",
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ResearchItemSchema.index({ workspaceId: 1, researchedAt: -1 });
ResearchItemSchema.index({ workspaceId: 1, kind: 1, status: 1 });
ResearchItemSchema.index(
  { workspaceId: 1, name: 1, market: 1 },
  { partialFilterExpression: { deletedAt: null } },
);

export type ResearchItemDoc = mongoose.InferSchemaType<
  typeof ResearchItemSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const ResearchItem =
  (mongoose.models.ResearchItem as mongoose.Model<ResearchItemDoc>) ||
  mongoose.model<ResearchItemDoc>(
    "ResearchItem",
    ResearchItemSchema,
    "research_items",
  );
