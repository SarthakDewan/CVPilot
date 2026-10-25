import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { User } from "../src/models/User.js";

let mongod: MongoMemoryServer;
let app: ReturnType<typeof createApp>;

const creds = { email: "ada@example.com", password: "correct horse battery" };

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.init();
  app = createApp(
    loadConfig({
      NODE_ENV: "test",
      MONGODB_URI: mongod.getUri(),
      JWT_SECRET: "t".repeat(40),
      CORS_ORIGINS: "http://localhost:5173",
    }),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe("auth API", () => {
  it("registers, sets an httpOnly cookie, and never returns the hash", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(creds);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(creds.email);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/cvpilot_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    const stored = await User.findOne({ email: creds.email }).select("+passwordHash");
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("rejects duplicate registration with 409", async () => {
    await request(app).post("/api/v1/auth/register").send(creds);
    const res = await request(app).post("/api/v1/auth/register").send(creds);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
  });

  it("returns a structured 400 for invalid input", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ email: "bad", password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it("logs in with correct credentials and rejects wrong ones identically", async () => {
    await request(app).post("/api/v1/auth/register").send(creds);
    const ok = await request(app).post("/api/v1/auth/login").send(creds);
    expect(ok.status).toBe(200);
    const badPw = await request(app).post("/api/v1/auth/login").send({ ...creds, password: "nope nope nope" });
    const noUser = await request(app).post("/api/v1/auth/login").send({ email: "who@example.com", password: "whatever12345" });
    expect(badPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(badPw.body.error.message).toBe(noUser.body.error.message);
  });

  it("protects /me and returns the session user when authenticated", async () => {
    expect((await request(app).get("/api/v1/auth/me")).status).toBe(401);
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/register").send(creds);
    const me = await agent.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(creds.email);
  });

  it("logout clears the session", async () => {
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/register").send(creds);
    await agent.post("/api/v1/auth/logout");
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
  });
});

describe("profile API", () => {
  it("requires auth, validates, and only updates the caller's own profile", async () => {
    expect((await request(app).get("/api/v1/profile")).status).toBe(401);

    const a = request.agent(app);
    const b = request.agent(app);
    await a.post("/api/v1/auth/register").send(creds);
    await b.post("/api/v1/auth/register").send({ email: "grace@example.com", password: "another long pass" });

    const bad = await a.put("/api/v1/profile").send({ skills: "not-an-array" });
    expect(bad.status).toBe(400);

    const upd = await a.put("/api/v1/profile").send({ skills: ["python", "sql"], preferredRoles: ["Data Analyst"] });
    expect(upd.status).toBe(200);
    expect(upd.body.profile.skills).toEqual(["python", "sql"]);

    const other = await b.get("/api/v1/profile");
    expect(other.body.profile.skills).toEqual([]);
  });
});

describe("platform", () => {
  it("health check and structured 404", async () => {
    expect((await request(app).get("/health")).body.status).toBe("ok");
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("only echoes CORS headers for allow-listed origins", async () => {
    const good = await request(app).get("/health").set("Origin", "http://localhost:5173");
    const bad = await request(app).get("/health").set("Origin", "http://evil.example");
    expect(good.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
