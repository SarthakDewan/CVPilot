import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { registerSchema } from "../src/routes/auth.js";
import {
  bcryptCostOf,
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "../src/services/auth.js";

const secret = "x".repeat(40);

describe("password hashing", () => {
  it("hashes with the configured cost (>= 12) and verifies", async () => {
    const hash = await hashPassword("correct horse battery", 12);
    expect(bcryptCostOf(hash)).toBe(12);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });
});

describe("access tokens", () => {
  const cfg = { jwtSecret: secret, jwtExpiresIn: "30m" };

  it("round-trips the user id", () => {
    const token = signAccessToken("user-1", cfg);
    expect(verifyAccessToken(token, cfg)?.sub).toBe("user-1");
  });

  it("rejects a token signed with another secret", () => {
    const token = signAccessToken("user-1", { ...cfg, jwtSecret: "y".repeat(40) });
    expect(verifyAccessToken(token, cfg)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signAccessToken("user-1", { ...cfg, jwtExpiresIn: "-10s" });
    expect(verifyAccessToken(token, cfg)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyAccessToken("not.a.jwt", cfg)).toBeNull();
  });
});

describe("registerSchema", () => {
  it("normalises email case and whitespace", () => {
    const r = registerSchema.parse({ email: "  Ada@Example.COM ", password: "longenoughpw" });
    expect(r.email).toBe("ada@example.com");
  });

  it("rejects short passwords and invalid emails", () => {
    expect(registerSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "nope", password: "longenoughpw" }).success).toBe(false);
  });

  it("rejects passwords over bcrypt's 72-byte limit", () => {
    expect(registerSchema.safeParse({ email: "a@b.co", password: "p".repeat(73) }).success).toBe(false);
  });
});

describe("loadConfig", () => {
  const base = { MONGODB_URI: "mongodb://x/y", JWT_SECRET: secret };

  it("rejects a bcrypt cost below 12", () => {
    expect(() => loadConfig({ ...base, BCRYPT_COST: "10" })).toThrow(/BCRYPT_COST/);
  });

  it("rejects a short JWT secret", () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: "short" })).toThrow(/JWT_SECRET/);
  });

  it("applies defaults", () => {
    const cfg = loadConfig(base);
    expect(cfg.bcryptCost).toBe(12);
    expect(cfg.corsOrigins).toEqual(["http://localhost:5173"]);
  });
});
