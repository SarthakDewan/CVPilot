import type { NextFunction, Request, Response } from "express";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import { COOKIE_NAME, verifyAccessToken } from "../services/auth.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

/** Requires a valid access-token cookie; sets req.userId. */
export function requireAuth(cfg: Pick<Config, "jwtSecret">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    const payload = token ? verifyAccessToken(token, cfg) : null;
    if (!payload) return next(AppError.unauthorized());
    req.userId = payload.sub;
    next();
  };
}
