import { Schema, model, type InferSchemaType } from "mongoose";

const marketInsightSchema = new Schema({
  role: { type: String, required: true, lowercase: true, trim: true },
  location: { type: String, required: true, lowercase: true, trim: true },
  listingCount: { type: Number, required: true, min: 0 },
  // skill -> number of listings containing it (demand d(s) = count / listingCount)
  skillCounts: { type: Map, of: Number, default: {} },
  salary: {
    count: Number,
    min: Number,
    max: Number,
    mean: Number,
    median: Number,
    p25: Number,
    p75: Number,
    currency: { type: String, default: "INR" },
  },
  updatedAt: { type: Date, required: true, default: () => new Date() },
});

marketInsightSchema.index({ role: 1, location: 1 }, { unique: true });

export type MarketInsightDoc = InferSchemaType<typeof marketInsightSchema>;
export const MarketInsight = model("MarketInsight", marketInsightSchema);
