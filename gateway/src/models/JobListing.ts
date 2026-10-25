import { Schema, model, type InferSchemaType } from "mongoose";

const jobListingSchema = new Schema({
  source: { type: String, required: true, default: "adzuna" },
  sourceId: { type: String, required: true },
  title: { type: String, required: true },
  company: { type: String },
  location: { type: String },
  description: { type: String, required: true },
  url: { type: String },
  salary: {
    min: Number,
    max: Number,
    currency: { type: String, default: "INR" },
  },
  requiredSkills: { type: [String], default: [] },
  scamRisk: {
    band: { type: String, enum: ["safe", "caution", "high"] },
    score: { type: Number, min: 0, max: 1 },
    reasons: { type: [String], default: [] },
    mode: { type: String, enum: ["hybrid", "rule-only"] },
  },
  fetchedAt: { type: Date, required: true, default: () => new Date() },
});

jobListingSchema.index({ source: 1, sourceId: 1 }, { unique: true });
jobListingSchema.index({ fetchedAt: -1 });

export type JobListingDoc = InferSchemaType<typeof jobListingSchema>;
export const JobListing = model("JobListing", jobListingSchema);
