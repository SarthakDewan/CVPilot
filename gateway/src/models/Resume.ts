import { Schema, model, type InferSchemaType } from "mongoose";

const resumeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    templateId: { type: String, required: true, default: "classic" },
    // Structured content (skills, experience, projects, achievements, education,
    // certifications). The exact shape is validated with zod in Phase 2.
    content: { type: Schema.Types.Mixed, default: {} },
    fileLink: { type: String },
    ats: {
      score: { type: Number, min: 0, max: 100 },
      matchedKeywords: { type: [String], default: undefined },
      missingKeywords: { type: [String], default: undefined },
      explanation: { type: String },
      explanationSource: { type: String, enum: ["gemini", "template"] },
      cosine: { type: Number },
      model: { type: String },
      truncatedResume: { type: Boolean },
      truncatedJob: { type: Boolean },
      jobDescriptionHash: { type: String },
      analyzedAt: { type: Date },
    },
    share: {
      // Only the SHA-256 of the share token is stored, so a database leak does
      // not expose working links. Null/absent means "not shared".
      tokenHash: { type: String, unique: true, sparse: true },
      expiresAt: { type: Date },
      createdAt: { type: Date },
    },
  },
  { timestamps: true },
);

export type ResumeDoc = InferSchemaType<typeof resumeSchema>;
export const Resume = model("Resume", resumeSchema);
