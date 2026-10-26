import { z } from "zod";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import { JobListing } from "../models/JobListing.js";
import { MarketInsight } from "../models/MarketInsight.js";
import { mlPost } from "./mlClient.js";
import { safeUrl, screeningSchema } from "./jobsSchema.js";

export const INSIGHT_TTL_MS = 10 * 60 * 1000; // do not re-hit Adzuna more often than this for the same role/location

const salarySchema = z.object({
  count: z.number(), min: z.number(), max: z.number(), mean: z.number(), median: z.number(), p25: z.number(), p75: z.number(), currency: z.string(),
});

const aggregateSchema = z.object({
  n: z.number().int(),
  skill_counts: z.record(z.string(), z.number().int()),
  salary: salarySchema.nullable(),
  salary_predicted_share: z.number().nullable(),
  listings: z.array(
    z.object({
      source_id: z.string(), title: z.string(), company: z.string(), location: z.string(), description: z.string(), url: z.string(),
      salary_min: z.number().nullable(), salary_max: z.number().nullable(), currency: z.string(), skills: z.array(z.string()),
      scam: screeningSchema,
    }),
  ),
});

export const norm = (s: string) => s.trim().toLowerCase();

export type InsightView = ReturnType<typeof serializeInsight>;

export function serializeInsight(i: {
  role: string; location?: string | null; listingCount: number; skills: { skill?: string | null; count?: number | null }[];
  salary?: { count?: number | null; min?: number | null; max?: number | null; mean?: number | null; median?: number | null; p25?: number | null; p75?: number | null; currency?: string | null } | null;
  salaryPredictedShare?: number | null; updatedAt: Date;
}) {
  const n = i.listingCount;
  const hasSalary = i.salary && typeof i.salary.count === "number";
  return {
    role: i.role,
    location: i.location ?? "",
    listingCount: n,
    skills: [...i.skills]
      .map((s) => ({ skill: s.skill ?? "", count: s.count ?? 0, demand: n ? (s.count ?? 0) / n : 0 }))
      .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill)),
    salary: hasSalary ? i.salary : null,
    salaryPredictedShare: i.salaryPredictedShare ?? null,
    updatedAt: i.updatedAt,
    source: "adzuna",
  };
}

/** Returns a cached insight when fresh, otherwise fetches listings via the ML service, aggregates and stores them. */
export async function refreshInsight(cfg: Config, roleIn: string, locationIn: string, opts: { maxAgeMs?: number } = {}) {
  const role = norm(roleIn);
  const location = norm(locationIn);
  const existing = await MarketInsight.findOne({ role, location });
  const maxAge = opts.maxAgeMs ?? INSIGHT_TTL_MS;
  if (existing && Date.now() - existing.updatedAt.getTime() < maxAge) return { insight: existing, cached: true };

  const parsed = aggregateSchema.safeParse(await mlPost(cfg, "/aggregate", { what: roleIn.trim(), where: locationIn.trim(), pages: 2 }, 120_000));
  if (!parsed.success) throw new AppError(502, "ml_error", "The market service returned an unexpected response");
  const a = parsed.data;
  if (a.n === 0) throw new AppError(404, "no_listings", "No listings were found for that role and location. Try a broader role or remove the location.");

  const now = new Date();
  const insight = await MarketInsight.findOneAndUpdate(
    { role, location },
    {
      $set: {
        listingCount: a.n,
        skills: Object.entries(a.skill_counts).map(([skill, count]) => ({ skill, count })),
        salary: a.salary ?? undefined,
        salaryPredictedShare: a.salary_predicted_share ?? undefined,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  await JobListing.bulkWrite(
    a.listings.map((l) => ({
      updateOne: {
        filter: { source: "adzuna", sourceId: l.source_id },
        update: {
          $set: {
            title: l.title, company: l.company, location: l.location, description: l.description, url: safeUrl(l.url),
            salary: { min: l.salary_min ?? undefined, max: l.salary_max ?? undefined, currency: l.currency || undefined },
            requiredSkills: l.skills,
            scamRisk: { band: l.scam.band, score: l.scam.risk, reasons: l.scam.fired.map((f) => f.reason), mode: l.scam.mode },
            fetchedAt: now,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return { insight, cached: false };
}
