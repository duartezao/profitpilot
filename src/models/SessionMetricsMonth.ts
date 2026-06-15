import mongoose, { Schema } from "mongoose";

const SessionMetricsMonthSchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    /** YYYY-MM */
    monthKey: { type: String, required: true, index: true },
    /** Código ISO (ex. BE) ou "" = todos os países */
    countryKey: { type: String, default: "", index: true },
    /** Gzip de tuplas diárias — ver session-metrics-codec.ts */
    blob: { type: Buffer, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false },
);

SessionMetricsMonthSchema.index(
  { storeId: 1, monthKey: 1, countryKey: 1 },
  { unique: true },
);

export type SessionMetricsMonthDoc = mongoose.InferSchemaType<
  typeof SessionMetricsMonthSchema
> & { _id: mongoose.Types.ObjectId };

export const SessionMetricsMonth =
  (mongoose.models.SessionMetricsMonth as mongoose.Model<SessionMetricsMonthDoc>) ||
  mongoose.model<SessionMetricsMonthDoc>(
    "SessionMetricsMonth",
    SessionMetricsMonthSchema,
  );
