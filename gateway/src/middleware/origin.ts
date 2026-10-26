import type { NextFunction, Request, Response } from "express";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth for cookie sessions: a state-changing request that carries an Origin header must come from
 * an allow-listed origin. Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE; non-browser clients
 * (curl, server-to-server) send none and are not CSRF vectors, so they are not blocked here.
 */
export function enforceOrigin(cfg: Pick<Config, "corsOrigins">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const origin = req.get("origin");
    if (SAFE.has(req.method) || !origin || cfg.corsOrigins.includes(origin)) return next();
    next(new AppError(403, "forbidden_origin", "Request origin is not allowed"));
  };
}
