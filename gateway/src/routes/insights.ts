import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { analysisLimiter } from "../middleware/rateLimit.js";
import { parseBody } from "../middleware/validate.js";
import { MarketInsight } from "../models/MarketInsight.js";
import { norm, refreshInsight, serializeInsight } from "../services/market.js";

const querySchema = z.object({ role: z.string().trim().min(2).max(120), location: z.string().trim().max(120).default("") });

export function insightsRouter(cfg: Config): Router {
  const router = Router();
  router.use(requireAuth(cfg));

  router.get("/", async (req, res) => {
    const q = querySchema.safeParse(req.query);
    if (!q.success) throw AppError.badRequest("role is required (2-120 characters)");
    const insight = await MarketInsight.findOne({ role: norm(q.data.role), location: norm(q.data.location) });
    if (!insight) throw AppError.notFound("No insights yet for this role and location. Refresh to fetch them.");
    res.json({ insight: serializeInsight(insight), cached: true });
  });

  router.post("/refresh", analysisLimiter(cfg), async (req, res) => {
    const { role, location } = parseBody(querySchema, req);
    const { insight, cached } = await refreshInsight(cfg, role, location);
    res.json({ insight: serializeInsight(insight), cached });
  });

  return router;
}
