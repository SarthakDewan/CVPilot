import { Router } from "express";
import mongoose from "mongoose";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { analysisLimiter } from "../middleware/rateLimit.js";
import { parseBody } from "../middleware/validate.js";
import { JobListing } from "../models/JobListing.js";
import { Resume } from "../models/Resume.js";
import { User } from "../models/User.js";
import { mlPost } from "../services/mlClient.js";
import { mlRankSchema, safeUrl, screenSchema, screeningSchema, searchSchema } from "../services/jobsSchema.js";
import { resumeContentSchema, resumeToText } from "../services/resumeSchema.js";

export function jobsRouter(cfg: Config): Router {
  const router = Router();
  router.use(requireAuth(cfg));

  router.post("/search", analysisLimiter(cfg), async (req, res) => {
    const body = parseBody(searchSchema, req);
    const user = await User.findById(req.userId);
    if (!user) throw AppError.unauthorized();

    let resumeText = "";
    let resumeSkills: string[] = [];
    if (body.resumeId) {
      if (!mongoose.isValidObjectId(body.resumeId)) throw AppError.notFound("Resume not found");
      const resume = await Resume.findOne({ _id: body.resumeId, userId: req.userId });
      if (!resume) throw AppError.notFound("Resume not found");
      const content = resumeContentSchema.parse(resume.content ?? {});
      resumeText = resumeToText(content);
      resumeSkills = content.skills;
    }
    const p = user.profile;
    const skills = [...new Set([...(p?.skills ?? []), ...resumeSkills])];
    const profileText = [
      `Target role: ${body.role}`,
      p?.professional?.headline,
      p?.professional?.summary,
      skills.length ? `Skills: ${skills.join(", ")}` : "",
      resumeText,
    ]
      .filter(Boolean)
      .join("\n");

    const ml = mlRankSchema.safeParse(
      await mlPost(
        cfg,
        "/rank",
        { profile_text: profileText, profile_skills: skills, what: body.role, where: body.location, k: body.k, fetch: Math.min(50, Math.max(30, body.k * 2)) },
        90_000,
      ),
    );
    if (!ml.success) throw new AppError(502, "ml_error", "The job service returned an unexpected response");

    const now = new Date();
    if (ml.data.results.length) {
      await JobListing.bulkWrite(
        ml.data.results.map((r) => ({
          updateOne: {
            filter: { source: "adzuna", sourceId: r.source_id },
            update: {
              $set: {
                title: r.title,
                company: r.company,
                location: r.location,
                description: r.description,
                url: safeUrl(r.url),
                salary: { min: r.salary_min ?? undefined, max: r.salary_max ?? undefined, currency: r.currency || undefined },
                requiredSkills: r.keywords,
                scamRisk: { band: r.scam.band, score: r.scam.risk, reasons: r.scam.fired.map((f) => f.reason), mode: r.scam.mode },
                fetchedAt: now,
              },
            },
            upsert: true,
          },
        })),
      );
    }

    res.json({
      mode: ml.data.mode,
      fetched: ml.data.fetched,
      source: "adzuna",
      results: ml.data.results.map((r) => ({
        id: r.source_id,
        title: r.title,
        company: r.company,
        location: r.location,
        description: r.description,
        url: safeUrl(r.url),
        salary: { min: r.salary_min, max: r.salary_max, currency: r.currency, predicted: r.salary_predicted },
        score: r.score,
        cosine: r.cosine,
        matchedTerms: r.matched_terms,
        scam: r.scam,
      })),
    });
  });

  router.post("/screen", analysisLimiter(cfg), async (req, res) => {
    const { text } = parseBody(screenSchema, req);
    const parsed = screeningSchema.safeParse(await mlPost(cfg, "/screen", { text }));
    if (!parsed.success) throw new AppError(502, "ml_error", "The screening service returned an unexpected response");
    res.json({ screening: parsed.data });
  });

  return router;
}
