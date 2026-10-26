import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { parseBody } from "../middleware/validate.js";
import { Resume } from "../models/Resume.js";
import { Roadmap } from "../models/Roadmap.js";
import { User } from "../models/User.js";
import { COOKIE_NAME, cookieOptions, verifyPassword } from "../services/auth.js";

const deleteSchema = z.object({ password: z.string().min(1).max(256) });

export function accountRouter(cfg: Config): Router {
  const router = Router();
  router.use(requireAuth(cfg));

  /** Everything CVPilot stores about the signed-in user (no password hash, no share-token hashes). */
  router.get("/export", async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw AppError.unauthorized();
    const [resumes, roadmap] = await Promise.all([Resume.find({ userId: req.userId }), Roadmap.findOne({ userId: req.userId })]);
    const data = {
      exportedAt: new Date().toISOString(),
      account: { email: user.email, createdAt: (user as unknown as { createdAt?: Date }).createdAt, profile: user.profile },
      resumes: resumes.map((r) => ({
        title: r.title, templateId: r.templateId, content: r.content, ats: r.ats ?? null,
        shared: Boolean(r.share?.tokenHash), shareExpiresAt: r.share?.expiresAt ?? null,
        createdAt: (r as unknown as { createdAt?: Date }).createdAt, updatedAt: (r as unknown as { updatedAt?: Date }).updatedAt,
      })),
      roadmap: roadmap ? { role: roadmap.role, location: roadmap.location, generatedAt: roadmap.generatedAt, items: roadmap.items, covered: roadmap.covered } : null,
    };
    res.setHeader("Content-Disposition", 'attachment; filename="cvpilot-data-export.json"');
    res.setHeader("Cache-Control", "no-store");
    res.json(data);
  });

  /** Permanently deletes the account, every resume (which also kills share links) and the roadmap. */
  router.post("/delete", authLimiter(cfg), async (req, res) => {
    const { password } = parseBody(deleteSchema, req);
    const user = await User.findById(req.userId).select("+passwordHash");
    if (!user) throw AppError.unauthorized();
    if (!(await verifyPassword(password, user.passwordHash))) throw AppError.unauthorized("Password is incorrect");
    const [resumes, roadmaps] = await Promise.all([Resume.deleteMany({ userId: user._id }), Roadmap.deleteMany({ userId: user._id })]);
    await user.deleteOne();
    res.clearCookie(COOKIE_NAME, cookieOptions(cfg));
    res.json({ deleted: { account: true, resumes: resumes.deletedCount, roadmaps: roadmaps.deletedCount } });
  });

  return router;
}
