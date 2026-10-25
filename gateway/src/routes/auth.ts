import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { parseBody } from "../middleware/validate.js";
import { User } from "../models/User.js";
import {
  COOKIE_NAME,
  cookieOptions,
  hashPassword,
  signAccessToken,
  verifyPassword,
} from "../services/auth.js";

// bcrypt only uses the first 72 bytes, so cap the length rather than silently truncate.
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .refine((p) => Buffer.byteLength(p) <= 72, "Password must be at most 72 bytes"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(256),
});

export function authRouter(cfg: Config): Router {
  const router = Router();
  const limit = authLimiter(cfg);
  const maxAgeMs = 30 * 60 * 1000;
  // Compared against when the email is unknown so response time doesn't reveal which emails exist.
  const dummyHashPromise = hashPassword("cvpilot-dummy-password", cfg.bcryptCost);

  const setSession = (res: import("express").Response, userId: string) => {
    res.cookie(COOKIE_NAME, signAccessToken(userId, cfg), { ...cookieOptions(cfg), maxAge: maxAgeMs });
  };

  router.post("/register", limit, async (req, res) => {
    const { email, password } = parseBody(registerSchema, req);
    if (await User.exists({ email })) throw AppError.conflict("An account with this email already exists");
    const passwordHash = await hashPassword(password, cfg.bcryptCost);
    let user;
    try {
      user = await User.create({ email, passwordHash });
    } catch (err) {
      // Lost a race against the unique index.
      if ((err as { code?: number }).code === 11000) {
        throw AppError.conflict("An account with this email already exists");
      }
      throw err;
    }
    setSession(res, user.id);
    res.status(201).json({ user: { id: user.id, email: user.email } });
  });

  router.post("/login", limit, async (req, res) => {
    const { email, password } = parseBody(loginSchema, req);
    const user = await User.findOne({ email }).select("+passwordHash");
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHashPromise));
    if (!user || !ok) throw AppError.unauthorized("Invalid email or password");
    setSession(res, user.id);
    res.json({ user: { id: user.id, email: user.email } });
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions(cfg));
    res.status(204).end();
  });

  router.get("/me", requireAuth(cfg), async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw AppError.unauthorized();
    res.json({ user: { id: user.id, email: user.email, profile: user.profile } });
  });

  return router;
}
