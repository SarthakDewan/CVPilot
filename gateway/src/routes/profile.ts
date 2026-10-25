import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { parseBody } from "../middleware/validate.js";
import { User } from "../models/User.js";

const shortList = (max = 50) => z.array(z.string().trim().min(1).max(100)).max(max);

export const profileSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  education: z
    .array(
      z.object({
        institution: z.string().trim().min(1).max(160),
        degree: z.string().trim().max(120).optional(),
        field: z.string().trim().max(120).optional(),
        startYear: z.number().int().min(1950).max(2100).optional(),
        endYear: z.number().int().min(1950).max(2100).optional(),
      }),
    )
    .max(10)
    .optional(),
  professional: z
    .object({
      headline: z.string().trim().max(160).optional(),
      yearsExperience: z.number().min(0).max(60).optional(),
      summary: z.string().trim().max(2000).optional(),
    })
    .optional(),
  achievements: shortList().optional(),
  preferredRoles: shortList(10).optional(),
  skills: shortList(100).optional(),
});

export function profileRouter(cfg: Config): Router {
  const router = Router();
  router.use(requireAuth(cfg));

  router.get("/", async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw AppError.unauthorized();
    res.json({ profile: user.profile });
  });

  router.put("/", async (req, res) => {
    const profile = parseBody(profileSchema, req);
    const user = await User.findByIdAndUpdate(req.userId, { $set: { profile } }, { returnDocument: "after" });
    if (!user) throw AppError.unauthorized();
    res.json({ profile: user.profile });
  });

  return router;
}
