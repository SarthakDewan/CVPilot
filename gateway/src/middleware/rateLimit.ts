import rateLimit from "express-rate-limit";
import type { Config } from "../config.js";

function limiter(cfg: Pick<Config, "isTest">, windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => cfg.isTest,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: "rate_limited", message } });
    },
  });
}

/** Login/register: 20 attempts per 15 minutes per IP. */
export const authLimiter = (cfg: Pick<Config, "isTest">) =>
  limiter(cfg, 15 * 60 * 1000, 20, "Too many attempts, please try again later");

/** Analysis routes (used from Phase 3): 30 requests per 15 minutes per IP. */
export const analysisLimiter = (cfg: Pick<Config, "isTest">) =>
  limiter(cfg, 15 * 60 * 1000, 30, "Too many analysis requests, please try again later");
