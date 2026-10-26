import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { JobListing } from "../src/models/JobListing.js";
import { MarketInsight } from "../src/models/MarketInsight.js";
import { Resume } from "../src/models/Resume.js";
import { Roadmap } from "../src/models/Roadmap.js";
import { User } from "../src/models/User.js";
import { progressOf } from "../src/routes/roadmap.js";

let mongod: MongoMemoryServer;
let app: ReturnType<typeof createApp>;
const PASSWORD = "a-long-password";

const screening = { rho: 0, p_clf: null, risk: 0, band: "safe", mode: "rule-only", fired: [], checked: [] };
const listing = (id: string, skills: string[]) => ({
  source_id: id, title: `Job ${id}`, company: "Acme", location: "Pune", description: "desc", url: `https://x.test/${id}`,
  salary_min: 100, salary_max: 200, currency: "INR", skills, scam: screening,
});
const AGG = {
  n: 10, skill_counts: { Python: 8, SQL: 5, "Node.js": 3, Kafka: 1 },
  salary: { count: 6, min: 100, max: 900, mean: 400, median: 350, p25: 200, p75: 600, currency: "INR" }, salary_predicted_share: 0.5,
  listings: [listing("1", ["Python", "SQL"]), listing("2", ["Node.js"])],
};
const ROADMAP_REPLY = {
  items: [
    { skill: "SQL", count: 5, demand: 0.5, guidance: "Learn joins.", guidance_source: "template" },
    { skill: "Node.js", count: 3, demand: 0.3, guidance: "Build an API.", guidance_source: "gemini" },
  ],
  covered: [{ skill: "Python", count: 8, demand: 0.8 }],
};

type Handler = (path: string, body: Record<string, unknown>) => { status?: number; json: unknown };
function mockMl(handler: Handler) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (!url.startsWith("http://ml.invalid")) return real(input, init);
    const r = handler(url.replace("http://ml.invalid", ""), JSON.parse(init!.body as string));
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  });
}
const defaultMl: Handler = (path) => ({ json: path === "/aggregate" ? AGG : ROADMAP_REPLY });

async function signedIn(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/register").send({ email, password: PASSWORD });
  return agent;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([User.init(), Resume.init(), JobListing.init(), MarketInsight.init(), Roadmap.init()]);
  app = createApp(loadConfig({ NODE_ENV: "test", MONGODB_URI: mongod.getUri(), JWT_SECRET: "t".repeat(40), ML_SERVICE_URL: "http://ml.invalid", ML_SHARED_SECRET: "shh" }));
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Resume.deleteMany({}), JobListing.deleteMany({}), MarketInsight.deleteMany({}), Roadmap.deleteMany({})]);
});
afterEach(() => vi.restoreAllMocks());

describe("market insights", () => {
  it("requires auth, validates, and 404s before any refresh", async () => {
    expect((await request(app).get("/api/v1/insights?role=dev")).status).toBe(401);
    const a = await signedIn("a@example.com");
    expect((await a.get("/api/v1/insights")).status).toBe(400);
    expect((await a.get("/api/v1/insights?role=Developer")).status).toBe(404);
  });

  it("refresh aggregates via ML, stores skills with dotted names, sorts by demand and upserts listings", async () => {
    const a = await signedIn("a@example.com");
    const spy = mockMl(defaultMl);
    const res = await a.post("/api/v1/insights/refresh").send({ role: "Python Developer", location: "Pune" });
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    const ins = res.body.insight;
    expect(ins.listingCount).toBe(10);
    expect(ins.skills.map((s: { skill: string }) => s.skill)).toEqual(["Python", "SQL", "Node.js", "Kafka"]);
    expect(ins.skills[0]).toEqual({ skill: "Python", count: 8, demand: 0.8 });
    expect(ins.salary.median).toBe(350);
    expect(ins.salaryPredictedShare).toBe(0.5);
    expect(await JobListing.countDocuments()).toBe(2);
    expect((await JobListing.findOne({ sourceId: "2" }))?.requiredSkills).toEqual(["Node.js"]);
    const call = spy.mock.calls.find((c) => String(c[0]).endsWith("/aggregate"))!;
    expect(JSON.parse(call[1]!.body as string)).toEqual({ what: "Python Developer", where: "Pune", pages: 2 });

    const got = await a.get("/api/v1/insights?role=python%20developer&location=PUNE");
    expect(got.status).toBe(200);
    expect(got.body.insight.listingCount).toBe(10);
  });

  it("serves a fresh insight from cache instead of calling Adzuna again", async () => {
    const a = await signedIn("a@example.com");
    const spy = mockMl(defaultMl);
    await a.post("/api/v1/insights/refresh").send({ role: "Dev" });
    const second = await a.post("/api/v1/insights/refresh").send({ role: "dev" });
    expect(second.body.cached).toBe(true);
    expect(spy.mock.calls.filter((c) => String(c[0]).endsWith("/aggregate"))).toHaveLength(1);
    await MarketInsight.updateOne({}, { $set: { updatedAt: new Date(Date.now() - 3600_000) } });
    expect((await a.post("/api/v1/insights/refresh").send({ role: "dev" })).body.cached).toBe(false);
  });

  it("reports no listings and Adzuna-not-configured clearly", async () => {
    const a = await signedIn("a@example.com");
    mockMl(() => ({ json: { ...AGG, n: 0, skill_counts: {}, salary: null, salary_predicted_share: null, listings: [] } }));
    const empty = await a.post("/api/v1/insights/refresh").send({ role: "Underwater Basket Weaver" });
    expect(empty.status).toBe(404);
    expect(empty.body.error.code).toBe("no_listings");
    vi.restoreAllMocks();
    mockMl(() => ({ status: 503, json: { detail: "Market insights are unavailable: Adzuna is not configured" } }));
    const off = await a.post("/api/v1/insights/refresh").send({ role: "Developer" });
    expect(off.status).toBe(503);
    expect(off.body.error.message).toMatch(/Adzuna is not configured/);
  });
});

describe("skill roadmap", () => {
  const content = { basics: { fullName: "Ada" }, summary: "Python developer", skills: ["Python"] };

  it("generates a roadmap from market demand, user skills and resume text, with progress at 0", async () => {
    const a = await signedIn("a@example.com");
    const rid = (await a.post("/api/v1/resumes").send({ title: "CV", content })).body.resume.id as string;
    await a.put("/api/v1/profile").send({ skills: ["Git"] });
    let mlBody: Record<string, unknown> = {};
    mockMl((path, body) => { if (path === "/roadmap") mlBody = body; return defaultMl(path, body); });
    const res = await a.post("/api/v1/roadmap/generate").send({ role: "Backend Developer", location: "Pune", resumeId: rid, tau: 0.2 });
    expect(res.status).toBe(200);
    const r = res.body.roadmap;
    expect(r.items.map((i: { skill: string }) => i.skill)).toEqual(["SQL", "Node.js"]);
    expect(r.items.every((i: { status: string }) => i.status === "not_started")).toBe(true);
    expect(r.progress).toEqual({ completed: 0, inProgress: 0, total: 2, percent: 0 });
    expect(r.covered[0].skill).toBe("Python");
    expect(mlBody).toMatchObject({ role: "Backend Developer", n: 10, tau: 0.2, skill_counts: { Python: 8, "Node.js": 3 } });
    expect([...(mlBody.user_skills as string[])].sort()).toEqual(["Git", "Python"]);
    expect(String(mlBody.user_text)).toContain("Python developer");
  });

  it("tracks milestones, computes progress as 100*completed/total, and keeps progress on regenerate", async () => {
    const a = await signedIn("a@example.com");
    mockMl(defaultMl);
    await a.post("/api/v1/roadmap/generate").send({ role: "Dev" });
    const r1 = await a.patch("/api/v1/roadmap/items").send({ skill: "SQL", status: "completed" });
    expect(r1.body.roadmap.progress).toEqual({ completed: 1, inProgress: 0, total: 2, percent: 50 });
    const r2 = await a.patch("/api/v1/roadmap/items").send({ skill: "Node.js", status: "in_progress" });
    expect(r2.body.roadmap.progress).toMatchObject({ completed: 1, inProgress: 1, percent: 50 });
    expect((await a.get("/api/v1/roadmap")).body.roadmap.items[0].status).toBe("completed");

    const again = await a.post("/api/v1/roadmap/generate").send({ role: "Dev" });
    expect(again.body.roadmap.items.find((i: { skill: string }) => i.skill === "SQL").status).toBe("completed");
    expect(await Roadmap.countDocuments()).toBe(1);
  });

  it("validates status updates and isolates users", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    mockMl(defaultMl);
    await a.post("/api/v1/roadmap/generate").send({ role: "Dev" });
    expect((await a.patch("/api/v1/roadmap/items").send({ skill: "SQL", status: "done" })).status).toBe(400);
    expect((await a.patch("/api/v1/roadmap/items").send({ skill: "COBOL", status: "completed" })).status).toBe(404);
    expect((await b.patch("/api/v1/roadmap/items").send({ skill: "SQL", status: "completed" })).status).toBe(404);
    expect((await b.get("/api/v1/roadmap")).body.roadmap).toBeNull();
    expect((await a.get("/api/v1/roadmap")).body.roadmap.items[0].status).toBe("not_started");
  });

  it("validates input and rejects another user's resume", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    const rid = (await a.post("/api/v1/resumes").send({ title: "CV", content })).body.resume.id as string;
    mockMl(defaultMl);
    expect((await a.post("/api/v1/roadmap/generate").send({ role: "Dev", tau: 5 })).status).toBe(400);
    expect((await a.post("/api/v1/roadmap/generate").send({})).status).toBe(400);
    expect((await b.post("/api/v1/roadmap/generate").send({ role: "Dev", resumeId: rid })).status).toBe(404);
  });

  it("progressOf handles an empty roadmap", () => {
    expect(progressOf([])).toEqual({ completed: 0, inProgress: 0, total: 0, percent: 0 });
    expect(progressOf([{ status: "completed" }, { status: "completed" }, { status: "not_started" }]).percent).toBe(66.7);
  });
});

describe("account export and deletion", () => {
  it("exports the user's data without secrets and not other users' data", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    const rid = (await a.post("/api/v1/resumes").send({ title: "Mine", content: { summary: "hello world resume" } })).body.resume.id as string;
    await a.post(`/api/v1/resumes/${rid}/share`).send({});
    await b.post("/api/v1/resumes").send({ title: "Theirs" });
    await a.put("/api/v1/profile").send({ skills: ["Python"] });
    const res = await a.get("/api/v1/account/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.body.account.email).toBe("a@example.com");
    expect(res.body.account.profile.skills).toEqual(["Python"]);
    expect(res.body.resumes).toHaveLength(1);
    expect(res.body.resumes[0]).toMatchObject({ title: "Mine", shared: true });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/passwordHash|tokenHash|\$2[aby]\$/);
    expect(text).not.toContain("Theirs");
    expect((await request(app).get("/api/v1/account/export")).status).toBe(401);
  });

  it("deletes the account, resumes, roadmap and share links; requires the right password", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    mockMl(defaultMl);
    const rid = (await a.post("/api/v1/resumes").send({ title: "Mine" })).body.resume.id as string;
    await b.post("/api/v1/resumes").send({ title: "Keep me" });
    const token = (await a.post(`/api/v1/resumes/${rid}/share`).send({})).body.token as string;
    await a.post("/api/v1/roadmap/generate").send({ role: "Dev" });
    expect((await request(app).get(`/api/v1/public/resumes/${token}`)).status).toBe(200);

    expect((await a.post("/api/v1/account/delete").send({ password: "wrong password!" })).status).toBe(401);
    expect((await a.post("/api/v1/account/delete").send({})).status).toBe(400);
    expect(await User.countDocuments({ email: "a@example.com" })).toBe(1);

    const del = await a.post("/api/v1/account/delete").send({ password: PASSWORD });
    expect(del.status).toBe(200);
    expect(del.body.deleted).toEqual({ account: true, resumes: 1, roadmaps: 1 });
    expect(await User.countDocuments({ email: "a@example.com" })).toBe(0);
    expect(await Resume.countDocuments({ title: "Mine" })).toBe(0);
    expect(await Roadmap.countDocuments()).toBe(0);
    expect((await request(app).get(`/api/v1/public/resumes/${token}`)).status).toBe(404);
    expect((await a.get("/api/v1/auth/me")).status).toBe(401);
    // another user's data is untouched
    expect(await Resume.countDocuments({ title: "Keep me" })).toBe(1);
    expect((await b.get("/api/v1/resumes")).body.resumes).toHaveLength(1);
  });
});
