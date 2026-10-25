import { Router, type Request } from "express";
import mongoose, { type HydratedDocument } from "mongoose";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { analysisLimiter } from "../middleware/rateLimit.js";
import { parseBody } from "../middleware/validate.js";
import { Resume, type ResumeDoc } from "../models/Resume.js";
import { exportFileName, renderDocx, renderPdf } from "../services/exporters.js";
import { mlPost } from "../services/mlClient.js";
import {
  createResumeSchema,
  resumeContentSchema,
  shareSchema,
  suggestSchema,
  updateResumeSchema,
  type TemplateId,
} from "../services/resumeSchema.js";
import { generateShareToken, hashShareToken } from "../services/shareToken.js";
import { TEMPLATES } from "../services/templates.js";

type ResumeLike = HydratedDocument<ResumeDoc>;

function serialize(r: ResumeLike) {
  const expiresAt = r.share?.expiresAt ?? null;
  return {
    id: r.id as string,
    title: r.title,
    templateId: r.templateId,
    content: r.content,
    ats: r.ats ?? null,
    shared: Boolean(r.share?.tokenHash),
    shareExpiresAt: expiresAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Loads a resume only if it belongs to the caller; otherwise 404 (never reveals existence). */
async function ownedResume(req: Request): Promise<ResumeLike> {
  const id = String(req.params.id);
  if (!mongoose.isValidObjectId(id)) throw AppError.notFound("Resume not found");
  const resume = await Resume.findOne({ _id: id, userId: req.userId });
  if (!resume) throw AppError.notFound("Resume not found");
  return resume;
}

export function resumesRouter(cfg: Config): Router {
  const router = Router();
  router.use(requireAuth(cfg));

  router.get("/templates", (_req, res) => {
    res.json({
      templates: Object.values(TEMPLATES).map(({ id, name, description, accent }) => ({ id, name, description, accent })),
    });
  });

  router.get("/", async (req, res) => {
    const resumes = await Resume.find({ userId: req.userId }).sort({ updatedAt: -1 }).limit(100);
    res.json({
      resumes: resumes.map((r) => ({
        id: r.id as string,
        title: r.title,
        templateId: r.templateId,
        shared: Boolean(r.share?.tokenHash),
        atsScore: r.ats?.score ?? null,
        updatedAt: r.updatedAt,
      })),
    });
  });

  router.post("/", async (req, res) => {
    const body = parseBody(createResumeSchema, req);
    const count = await Resume.countDocuments({ userId: req.userId });
    if (count >= 25) throw AppError.badRequest("Resume limit reached (25). Delete one to create another.");
    const resume = await Resume.create({ ...body, userId: req.userId });
    res.status(201).json({ resume: serialize(resume) });
  });

  // Gemini-backed phrasing help. Only the single snippet the user submits is forwarded.
  router.post("/suggest", analysisLimiter(cfg), async (req, res) => {
    const body = parseBody(suggestSchema, req);
    const out = await mlPost<{ suggestions: string[] }>(cfg, "/suggest", body);
    res.json({ suggestions: out.suggestions });
  });

  router.get("/:id", async (req, res) => {
    res.json({ resume: serialize(await ownedResume(req)) });
  });

  router.put("/:id", async (req, res) => {
    const resume = await ownedResume(req);
    const patch = parseBody(updateResumeSchema, req);
    if (patch.title !== undefined) resume.title = patch.title;
    if (patch.templateId !== undefined) resume.templateId = patch.templateId;
    if (patch.content !== undefined) {
      resume.content = patch.content;
      resume.set("ats", undefined); // a stored ATS result is stale once the content changes
      resume.markModified("content");
    }
    await resume.save();
    res.json({ resume: serialize(resume) });
  });

  router.delete("/:id", async (req, res) => {
    const resume = await ownedResume(req);
    await resume.deleteOne(); // share link dies with the document
    res.status(204).end();
  });

  router.post("/:id/share", async (req, res) => {
    const resume = await ownedResume(req);
    const { expiresInDays } = parseBody(shareSchema, req);
    const token = generateShareToken();
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : undefined;
    resume.set("share", { tokenHash: hashShareToken(token), expiresAt, createdAt: new Date() });
    await resume.save();
    // The raw token is returned exactly once; only its hash is stored.
    res.status(201).json({ token, path: `/r/${token}`, expiresAt: expiresAt ?? null });
  });

  router.delete("/:id/share", async (req, res) => {
    const resume = await ownedResume(req);
    resume.set("share", undefined);
    await resume.save();
    res.status(204).end();
  });

  router.get("/:id/export", async (req, res) => {
    const format = String(req.query.format ?? "");
    if (format !== "pdf" && format !== "docx") throw AppError.badRequest("format must be 'pdf' or 'docx'");
    const resume = await ownedResume(req);
    const content = resumeContentSchema.parse(resume.content ?? {});
    const templateId = resume.templateId as TemplateId;
    const buf = format === "pdf" ? await renderPdf(content, templateId) : await renderDocx(content, templateId);
    res.setHeader(
      "Content-Type",
      format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${exportFileName(resume.title, format)}"`);
    res.send(buf);
  });

  return router;
}
