import mongoose, { Schema } from "mongoose";

/** Campos manuais do template do relatório diário (app.md). */
export type DailyNoteReportFields = {
  productsTested?: string;
  collectionsTested?: string;
  collectionsTestedList?: string;
  nextCollection?: string;
  bestSellerCollection?: string;
  dayNumber?: string;
  difficulties?: string;
  obs?: string;
};

export type DailyNoteApiSnapshot = {
  spend?: number | null;
  clicks?: number | null;
  impressions?: number | null;
  conversions?: number | null;
  conversionValue?: number | null;
  roas?: number | null;
  cpc?: number | null;
  ctr?: number | null;
  cpm?: number | null;
  currency?: string;
  bestCampaign?: string;
  campaignSuggestion?: string;
  syncedAt?: Date;
};

const ReportFieldsSchema = new Schema(
  {
    productsTested: { type: String, trim: true, default: "" },
    collectionsTested: { type: String, trim: true, default: "" },
    collectionsTestedList: { type: String, trim: true, default: "" },
    nextCollection: { type: String, trim: true, default: "" },
    bestSellerCollection: { type: String, trim: true, default: "" },
    dayNumber: { type: String, trim: true, default: "" },
    difficulties: { type: String, trim: true, default: "" },
    obs: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const ApiSnapshotSchema = new Schema(
  {
    spend: { type: Number, default: null },
    clicks: { type: Number, default: null },
    impressions: { type: Number, default: null },
    conversions: { type: Number, default: null },
    conversionValue: { type: Number, default: null },
    roas: { type: Number, default: null },
    cpc: { type: Number, default: null },
    ctr: { type: Number, default: null },
    cpm: { type: Number, default: null },
    currency: { type: String, trim: true, default: "EUR" },
    bestCampaign: { type: String, trim: true, default: "" },
    campaignSuggestion: { type: String, trim: true, default: "" },
    syncedAt: { type: Date },
  },
  { _id: false },
);

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
    reportFields: { type: ReportFieldsSchema, default: () => ({}) },
    apiSnapshot: { type: ApiSnapshotSchema, default: null },
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
