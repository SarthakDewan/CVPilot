import { z } from "zod";

export const searchSchema = z.object({
  role: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).default(""),
  k: z.number().int().min(1).max(50).default(10),
  resumeId: z.string().trim().optional(),
});

export const screenSchema = z.object({
  text: z.string().trim().min(20, "Paste at least 20 characters of the job listing").max(20000),
});

const firedSchema = z.object({ id: z.string(), name: z.string(), reason: z.string(), evidence: z.string() });

export const screeningSchema = z.object({
  rho: z.number(),
  p_clf: z.number().nullable(),
  risk: z.number(),
  band: z.enum(["safe", "caution", "high"]),
  mode: z.enum(["hybrid", "rule-only"]),
  fired: z.array(firedSchema),
  checked: z.array(z.object({ id: z.string(), name: z.string(), fired: z.boolean() })),
});

export const mlRankSchema = z.object({
  fetched: z.number().int(),
  mode: z.enum(["hybrid", "rule-only"]),
  results: z.array(
    z.object({
      source_id: z.string(),
      title: z.string(),
      company: z.string(),
      location: z.string(),
      description: z.string(),
      url: z.string(),
      salary_min: z.number().nullable(),
      salary_max: z.number().nullable(),
      salary_predicted: z.boolean(),
      currency: z.string(),
      score: z.number().int(),
      cosine: z.number(),
      matched_terms: z.array(z.string()),
      keywords: z.array(z.string()),
      scam: screeningSchema,
    }),
  ),
});

export type MlRankResult = z.infer<typeof mlRankSchema>["results"][number];

/** Only http(s) links are passed to the browser; anything else becomes an empty string. */
export function safeUrl(u: string): string {
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : "";
  } catch {
    return "";
  }
}
