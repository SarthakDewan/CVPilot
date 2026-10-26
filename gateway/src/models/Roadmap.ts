import { Schema, model, type InferSchemaType } from "mongoose";

export const STATUSES = ["not_started", "in_progress", "completed"] as const;
export type Status = (typeof STATUSES)[number];

const itemSchema = new Schema(
  {
    skill: { type: String, required: true },
    count: { type: Number, required: true },
    demand: { type: Number, required: true },
    guidance: { type: String, default: "" },
    guidanceSource: { type: String, enum: ["gemini", "template"], default: "template" },
    status: { type: String, enum: STATUSES, default: "not_started" },
  },
  { _id: false },
);

const roadmapSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    role: { type: String, required: true },
    location: { type: String, default: "" },
    tau: { type: Number, required: true },
    listingCount: { type: Number, required: true },
    items: { type: [itemSchema], default: [] },
    covered: { type: [new Schema({ skill: String, count: Number, demand: Number }, { _id: false })], default: [] },
    generatedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

export type RoadmapDoc = InferSchemaType<typeof roadmapSchema>;
export const Roadmap = model("Roadmap", roadmapSchema);
