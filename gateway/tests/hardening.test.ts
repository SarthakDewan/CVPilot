import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { Resume } from "../src/models/Resume.js";
import { User } from "../src/models/User.js";
import { DEMO_EMAIL, seedDemo } from "../src/seed.js";
import { verifyPassword } from "../src/services/auth.js";

let mongod: MongoMemoryServer;
let app: ReturnType<typeof createApp>;
const ORIGIN = "http://localhost:5173";

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([User.init(), Resume.init()]);
  app = createApp(loadConfig({ NODE_ENV: "test", MONGODB_URI: mongod.getUri(), JWT_SECRET: "t".repeat(40), CORS_ORIGINS: ORIGIN, ML_SERVICE_URL: "http://ml.invalid", ML_SHARED_SECRET: "shh" }));
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
beforeEach(async () => { await Promise.all([User.deleteMany({}), Resume.deleteMany({})]); });
afterEach(() => vi.restoreAllMocks());

describe("origin check (CSRF defence in depth)", () => {
  const creds = { email: "a@example.com", password: "a-long-password" };

  it("rejects state-changing requests from other origins, even with a valid session cookie", async () => {
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/register").set("Origin", ORIGIN).send(creds);
    const evil = await agent.put("/api/v1/profile").set("Origin", "http://evil.example").send({ skills: ["x"] });
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe("forbidden_origin");
    expect((await agent.put("/api/v1/profile").set("Origin", ORIGIN).send({ skills: ["ok"] })).status).toBe(200);
    expect((await agent.post("/api/v1/account/delete").set("Origin", "https://evil.example").send({ password: creds.password })).status).toBe(403);
    expect(await User.countDocuments()).toBe(1);
  });

  it("allows reads from anywhere and non-browser clients without an Origin header", async () => {
    expect((await request(app).get("/api/v1/public/resumes/" + "A".repeat(43)).set("Origin", "http://evil.example")).status).toBe(404);
    expect((await request(app).post("/api/v1/auth/register").send(creds)).status).toBe(201);
  });

  it("blocks cross-origin login attempts too", async () => {
    expect((await request(app).post("/api/v1/auth/login").set("Origin", "http://evil.example").send(creds)).status).toBe(403);
  });
});

describe("request ids and error shape", () => {
  it("returns an x-request-id header and includes it in error bodies; honours a valid incoming id", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
    const custom = await request(app).get("/api/v1/nope").set("x-request-id", "trace-12345678");
    expect(custom.headers["x-request-id"]).toBe("trace-12345678");
    const bad = await request(app).get("/api/v1/nope").set("x-request-id", "bad id with spaces & symbols!");
    expect(bad.headers["x-request-id"]).not.toContain(" ");
  });

  it("never leaks internals for unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(User, "findById").mockImplementation(() => { throw new Error("db password=hunter2 exploded"); });
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/register").send({ email: "b@example.com", password: "a-long-password" });
    const res = await agent.get("/api/v1/auth/me");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(res.body.error).toMatchObject({ code: "internal_error", requestId: expect.any(String) });
    expect(String(spy.mock.calls[0]?.[0])).toContain(res.body.error.requestId);
  });

  it("rejects oversized and malformed JSON bodies", async () => {
    expect((await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send("{not json")).status).toBe(400);
    const big = await request(app).post("/api/v1/auth/login").send({ email: "a@b.co", password: "x".repeat(300_000) });
    expect(big.status).toBe(413);
  });
});

describe("readiness", () => {
  it("is ready when the database and ML service answer, degraded otherwise", async () => {
    const real = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
      String(input).startsWith("http://ml.invalid") ? new Response("{}", { status: 200 }) : real(input, init));
    const ok = await request(app).get("/ready");
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ status: "ready", db: true, ml: true });
    expect((spy.mock.calls.find((c) => String(c[0]).includes("/internal/ping"))![1]!.headers as Record<string, string>)["x-ml-secret"]).toBe("shh");

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).startsWith("http://ml.invalid")) throw new Error("down");
      return real(input, init);
    });
    const down = await request(app).get("/ready");
    expect(down.status).toBe(503);
    expect(down.body).toEqual({ status: "degraded", db: true, ml: false });
  });
});

describe("demo seed", () => {
  it("creates one labelled demo user and resume, is idempotent, and creates nothing else", async () => {
    const u1 = await seedDemo(12, "demo-password-123");
    await seedDemo(12, "different-password");
    expect(await User.countDocuments()).toBe(1);
    expect(u1.email).toBe(DEMO_EMAIL);
    const stored = await User.findOne({ email: DEMO_EMAIL }).select("+passwordHash");
    expect(await verifyPassword("demo-password-123", stored!.passwordHash)).toBe(true); // second run did not reset it
    const resumes = await Resume.find();
    expect(resumes).toHaveLength(1);
    expect(resumes[0]!.title).toContain("DEMO DATA");
    expect(JSON.stringify(resumes[0]!.content)).toContain("DEMO DATA");
    expect(resumes[0]!.ats?.score).toBeUndefined(); // no fabricated scores
  });
});

describe("integration status", () => {
  it("requires auth and reports the ML service's feature flags (or all-off when it is down)", async () => {
    expect((await request(app).get("/api/v1/status")).status).toBe(401);
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/register").send({ email: "s@example.com", password: "a-long-password" });
    const real = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
      String(input).startsWith("http://ml.invalid")
        ? new Response(JSON.stringify({ classifier: true, gemini: false, adzuna: true, embedding_model: "m" }), { status: 200 })
        : real(input, init));
    expect((await agent.get("/api/v1/status")).body).toEqual({ mlService: true, classifier: true, gemini: false, adzuna: true, embeddingModel: "m" });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).startsWith("http://ml.invalid")) throw new Error("down");
      return real(input, init);
    });
    expect((await agent.get("/api/v1/status")).body).toMatchObject({ mlService: false, classifier: false, gemini: false, adzuna: false });
  });
});
