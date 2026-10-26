import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare module "express-serve-static-core" {
  interface Request {
    id?: string;
  }
}

/** Tags every request with an id (honouring a sane incoming x-request-id) for log/error correlation. */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get("x-request-id");
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
