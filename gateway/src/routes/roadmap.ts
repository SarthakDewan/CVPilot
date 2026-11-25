import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { analysisLimiter } from "../middleware/rateLimit.js";
import { parseBody } from "../middleware/validate.js";
import { Resume } from "../models/Resume.js";
import { Roadmap, STATUSES, type RoadmapDoc } from "../models/Roadmap.js";
import { User } from "../models/User.js";
import { norm, refreshInsight } from "../services/market.js";
import { mlPost } from "../services/mlClient.js";
import { resumeContentSchema, resumeToText } from "../services/resumeSchema.js";

const INSIGHT_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const generateSchema = z.object({
  role: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).default(""),
  resumeId: z.string().trim().optional(),
  tau: z.number().min(0.01).max(1).default(0.1),
});
const statusSchema = z.object({ skill: z.string().trim().min(1).max(80), status: z.enum(STATUSES) });
const mlRoadmapSchema = z.object({
  items: z.array(z.object({ skill: z.string(), count: z.number(), demand: z.number(), guidance: z.string(), guidance_source: z.enum(["gemini", "template"]) })),
  covered: z.array(z.object({ skill: z.string(), count: z.number(), demand: z.number() })),
});

/** Progress = 100 * |completed| / |roadmap|. */
export function progressOf(items: { status?: string | null }[]) {
  const total = items.length;
  const completed = items.filter((i) => i.status === "completed").length;
  return { completed, inProgress: items.filter((i) => i.status === "in_progress").length, total, percent: total ? Math.round((1000 * completed) / total) / 10 : 0 };
}

export function serializeRoadmap(r: RoadmapDoc & { generatedAt: Date }) {
  return {
    role: r.role,
    location: r.location ?? "",
    tau: r.tau,
    listingCount: r.listingCount,
    generatedAt: r.generatedAt,
    items: r.items.map((i) => ({ skill: i.skill, count: i.count, demand: i.demand, guidance: i.guidance ?? "", guidanceSource: i.guidanceSource ?? "template", status: i.status ?? "not_started" })),
    covered: r.covered.map((c) => ({ skill: c.skill, count: c.count, demand: c.demand })),
    progress: progressOf(r.items),
  };
}

export function roadmapRouter(cfg: Config): Router {
  const router = Router();
  router.use(requireAuth(cfg));

  router.get("/", async (req, res) => {
    const r = await Roadmap.findOne({ userId: req.userId });
    res.json({ roadmap: r ? serializeRoadmap(r) : null });
  });

  router.post("/generate", analysisLimiter(cfg), async (req, res) => {
    const body = parseBody(generateSchema, req);
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

    const { insight } = await refreshInsight(cfg, body.role, body.location, { maxAgeMs: INSIGHT_MAX_AGE_MS });
    const fresh = insight;
    const skillCounts = Object.fromEntries(fresh.skills.map((s) => [s.skill, s.count]));
    const ml = mlRoadmapSchema.safeParse(
      await mlPost(cfg, "/roadmap", {
        role: body.role,
        user_skills: [...new Set([...(user.profile?.skills ?? []), ...resumeSkills])],
        user_text: resumeText,
        skill_counts: skillCounts,
        n: fresh.listingCount,
        tau: body.tau,
      }),
    );
    if (!ml.success) throw new AppError(502, "ml_error", "The roadmap service returned an unexpected response");

    // Keep the user's progress on skills that stay on the regenerated roadmap.
    const previous = await Roadmap.findOne({ userId: req.userId });
    const prevStatus = new Map((previous?.items ?? []).map((i) => [i.skill, i.status]));
    const roadmap = await Roadmap.findOneAndUpdate(
      { userId: req.userId },
      {
        $set: {
          role: norm(body.role),
          location: norm(body.location),
          tau: body.tau,
          listingCount: fresh.listingCount,
          generatedAt: new Date(),
          covered: ml.data.covered,
          items: ml.data.items.map((i) => ({
            skill: i.skill, count: i.count, demand: i.demand, guidance: i.guidance, guidanceSource: i.guidance_source,
            status: prevStatus.get(i.skill) ?? "not_started",
          })),
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    res.json({ roadmap: serializeRoadmap(roadmap) });
  });

  router.patch("/items", async (req, res) => {
    const { skill, status } = parseBody(statusSchema, req);
    const roadmap = await Roadmap.findOneAndUpdate(
      { userId: req.userId, "items.skill": skill },
      { $set: { "items.$.status": status } },
      { returnDocument: "after" },
    );
    if (!roadmap) throw AppError.notFound("That skill is not on your roadmap");
    res.json({ roadmap: serializeRoadmap(roadmap) });
  });

  return router;
}
