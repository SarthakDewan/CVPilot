import { Router } from "express";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import { Resume } from "../models/Resume.js";
import { hashShareToken } from "../services/shareToken.js";
import rateLimit from "express-rate-limit";

/** Unauthenticated, read-only view of a shared resume. */
export function publicResumesRouter(cfg: Pick<Config, "isTest">): Router {
  const router = Router();
  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      skip: () => cfg.isTest,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({ error: { code: "rate_limited", message: "Too many requests" } });
      },
    }),
  );

  router.get("/:token", async (req, res) => {
    const token = String(req.params.token);
    if (token.length < 20 || token.length > 100) throw AppError.notFound("This link is invalid or has been revoked");
    const resume = await Resume.findOne({ "share.tokenHash": hashShareToken(token) });
    const expired = resume?.share?.expiresAt && resume.share.expiresAt.getTime() < Date.now();
    if (!resume || expired) throw AppError.notFound("This link is invalid, expired or has been revoked");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Cache-Control", "no-store");
    // Deliberately excludes userId, ATS data and anything else not needed to render the resume.
    res.json({ resume: { title: resume.title, templateId: resume.templateId, content: resume.content } });
  });

  return router;
}
