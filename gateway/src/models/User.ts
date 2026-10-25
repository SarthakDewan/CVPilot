import { Schema, model, type InferSchemaType } from "mongoose";

const educationSchema = new Schema(
  {
    institution: { type: String, required: true, trim: true },
    degree: { type: String, trim: true },
    field: { type: String, trim: true },
    startYear: Number,
    endYear: Number,
  },
  { _id: false },
);

const profileSchema = new Schema(
  {
    fullName: { type: String, trim: true, maxlength: 120 },
    location: { type: String, trim: true, maxlength: 120 },
    education: { type: [educationSchema], default: [] },
    professional: {
      headline: { type: String, trim: true, maxlength: 160 },
      yearsExperience: { type: Number, min: 0, max: 60 },
      summary: { type: String, trim: true, maxlength: 2000 },
    },
    achievements: { type: [String], default: [] },
    preferredRoles: { type: [String], default: [] },
    skills: { type: [String], default: [] },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    profile: { type: profileSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
