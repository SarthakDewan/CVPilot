import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("30m"),
  BCRYPT_COST: z.coerce.number().int().min(12, "BCRYPT_COST must be >= 12").max(15).default(12),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  ML_SERVICE_URL: z.string().default("http://localhost:8000"),
  ML_SHARED_SECRET: z.string().default(""),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    isProd: e.NODE_ENV === "production",
    isTest: e.NODE_ENV === "test",
    port: e.PORT,
    mongoUri: e.MONGODB_URI,
    jwtSecret: e.JWT_SECRET,
    jwtExpiresIn: e.JWT_EXPIRES_IN,
    bcryptCost: e.BCRYPT_COST,
    corsOrigins: e.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    cookieSameSite: e.COOKIE_SAMESITE,
    mlServiceUrl: e.ML_SERVICE_URL,
    mlSharedSecret: e.ML_SHARED_SECRET,
  };
}
