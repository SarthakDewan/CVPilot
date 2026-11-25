import { Schema, model, type InferSchemaType } from "mongoose";

const marketInsightSchema = new Schema({
  role: { type: String, required: true, lowercase: true, trim: true },
  location: { type: String, default: "", lowercase: true, trim: true },
  listingCount: { type: Number, required: true, min: 0 },
  // An array (not a Map) because skill names such as "Node.js" or ".NET" contain dots, which Mongo map keys forbid.
  // demand d(s) = count / listingCount
  skills: { type: [new Schema({ skill: String, count: Number }, { _id: false })], default: [] },
  salary: {
    count: Number,
    min: Number,
    max: Number,
    mean: Number,
    median: Number,
    p25: Number,
    p75: Number,
    currency: String,
  },
  salaryPredictedShare: { type: Number },
  source: { type: String, default: "adzuna" },
  updatedAt: { type: Date, required: true, default: () => new Date() },
});

marketInsightSchema.index({ role: 1, location: 1 }, { unique: true });

export type MarketInsightDoc = InferSchemaType<typeof marketInsightSchema>;
export const MarketInsight = model("MarketInsight", marketInsightSchema);
