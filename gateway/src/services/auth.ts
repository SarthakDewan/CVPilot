import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Config } from "../config.js";

export const COOKIE_NAME = "cvpilot_token";

export interface TokenPayload {
  sub: string;
}

export function hashPassword(password: string, cost: number): Promise<string> {
  return bcrypt.hash(password, cost);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Cost factor encoded in a bcrypt hash ("$2b$12$..." -> 12). */
export function bcryptCostOf(hash: string): number {
  return Number(hash.split("$")[2]);
}

export function signAccessToken(userId: string, cfg: Pick<Config, "jwtSecret" | "jwtExpiresIn">): string {
  return jwt.sign({ sub: userId }, cfg.jwtSecret, {
    algorithm: "HS256",
    expiresIn: cfg.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string, cfg: Pick<Config, "jwtSecret">): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, cfg.jwtSecret, { algorithms: ["HS256"] });
    if (typeof decoded === "string" || typeof decoded.sub !== "string") return null;
    return { sub: decoded.sub };
  } catch {
    return null;
  }
}

export function cookieOptions(cfg: Pick<Config, "isProd" | "cookieSameSite">) {
  return {
    httpOnly: true,
    secure: cfg.isProd || cfg.cookieSameSite === "none",
    sameSite: cfg.cookieSameSite,
    path: "/",
  } as const;
}
