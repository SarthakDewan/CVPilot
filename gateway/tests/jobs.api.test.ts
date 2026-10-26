import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { JobListing } from "../src/models/JobListing.js";
import { Resume } from "../src/models/Resume.js";
import { User } from "../src/models/User.js";
import { safeUrl } from "../src/services/jobsSchema.js";

let mongod: MongoMemoryServer;
let app: ReturnType<typeof createApp>;

const screening = (band: "safe" | "caution" | "high", fired: string[] = []) => ({
  rho: fired.length / 4, p_clf: null, risk: fired.length / 4, band, mode: "rule-only" as const,
  fired: fired.map((id) => ({ id, name: `Rule ${id}`, reason: `Reason ${id}`, evidence: `evidence ${id}` })),
  checked: ["h1", "h2", "h3", "h4"].map((id) => ({ id, name: `Rule ${id}`, fired: fired.includes(id) })),
});
const mlJob = (id: string, over: object = {}) => ({
  source_id: id, title: `Job ${id}`, company: "Acme", location: "Pune", description: "Build APIs", url: "https://adzuna.in/ad/" + id,
  salary_min: 500000, salary_max: 800000, salary_predicted: false, currency: "INR", score: 71, cosine: 0.71,
  matched_terms: ["Python"], keywords: ["python", "api"], scam: screening("safe"), ...over,
});

const resumeContent = { basics: { fullName: "Ada" }, summary: "Backend developer who builds APIs.", skills: ["Python", "Django"] };

async function signedIn(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/register").send({ email, password: "a-long-password" });
  return agent;
}
function mockMl(handler: (path: string, body: Record<string, unknown>) => { status?: number; json: unknown }) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (!url.startsWith("http://ml.invalid")) return real(input, init);
    const r = handler(url.replace("http://ml.invalid", ""), JSON.parse(init!.body as string));
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([User.init(), Resume.init(), JobListing.init()]);
  app = createApp(loadConfig({ NODE_ENV: "test", MONGODB_URI: mongod.getUri(), JWT_SECRET: "t".repeat(40), ML_SERVICE_URL: "http://ml.invalid", ML_SHARED_SECRET: "shh" }));
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
beforeEach(async () => { await Promise.all([User.deleteMany({}), Resume.deleteMany({}), JobListing.deleteMany({})]); });
afterEach(() => vi.restoreAllMocks());

describe("job search", () => {
  it("requires auth and validates input", async () => {
    expect((await request(app).post("/api/v1/jobs/search").send({ role: "dev" })).status).toBe(401);
    const a = await signedIn("a@example.com");
    expect((await a.post("/api/v1/jobs/search").send({})).status).toBe(400);
    expect((await a.post("/api/v1/jobs/search").send({ role: "dev", k: 500 })).status).toBe(400);
  });

  it("builds the profile from the resume, calls ML /rank with the secret, persists listings and returns scam info", async () => {
    const a = await signedIn("a@example.com");
    const rid = (await a.post("/api/v1/resumes").send({ title: "CV", content: resumeContent })).body.resume.id as string;
    let sent: { path: string; body: Record<string, unknown> } | undefined;
    const spy = mockMl((path, body) => {
      sent = { path, body };
      return { json: { fetched: 30, mode: "rule-only", results: [mlJob("1"), mlJob("2", { scam: screening("high", ["h1", "h3"]), url: "javascript:alert(1)" })] } };
    });
    const res = await a.post("/api/v1/jobs/search").send({ role: "Backend Developer", location: "Pune", k: 5, resumeId: rid });
    expect(res.status).toBe(200);
    expect(sent?.path).toBe("/rank");
    expect(sent?.body).toMatchObject({ what: "Backend Developer", where: "Pune", k: 5 });
    expect(String(sent?.body.profile_text)).toContain("Target role: Backend Developer");
    expect(String(sent?.body.profile_text)).toContain("Backend developer who builds APIs");
    expect(sent?.body.profile_skills).toEqual(["Python", "Django"]);
    const call = spy.mock.calls.find((c) => String(c[0]).includes("ml.invalid"))!;
    expect((call[1]!.headers as Record<string, string>)["x-ml-secret"]).toBe("shh");

    expect(res.body.results).toHaveLength(2);
    expect(res.body.mode).toBe("rule-only");
    // high-risk results are returned (labelled), never hidden
    expect(res.body.results[1].scam.band).toBe("high");
    expect(res.body.results[1].scam.fired.map((f: { id: string }) => f.id)).toEqual(["h1", "h3"]);
    // unsafe URL schemes never reach the browser
    expect(res.body.results[1].url).toBe("");
    expect(res.body.results[0].url).toBe("https://adzuna.in/ad/1");

    const stored = await JobListing.find().sort({ sourceId: 1 });
    expect(stored).toHaveLength(2);
    expect(stored[1]?.scamRisk?.band).toBe("high");
    expect(stored[1]?.scamRisk?.reasons).toEqual(["Reason h1", "Reason h3"]);
    expect(stored[0]?.requiredSkills).toEqual(["python", "api"]);
  });

  it("re-running a search upserts instead of duplicating listings", async () => {
    const a = await signedIn("a@example.com");
    mockMl(() => ({ json: { fetched: 1, mode: "rule-only", results: [mlJob("1")] } }));
    await a.post("/api/v1/jobs/search").send({ role: "Developer" });
    await a.post("/api/v1/jobs/search").send({ role: "Developer" });
    expect(await JobListing.countDocuments()).toBe(1);
  });

  it("will not use another user's resume", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    const rid = (await a.post("/api/v1/resumes").send({ title: "CV", content: resumeContent })).body.resume.id as string;
    mockMl(() => ({ json: { fetched: 0, mode: "rule-only", results: [] } }));
    expect((await b.post("/api/v1/jobs/search").send({ role: "Developer", resumeId: rid })).status).toBe(404);
    expect((await b.post("/api/v1/jobs/search").send({ role: "Developer", resumeId: "nope" })).status).toBe(404);
  });

  it("passes through 'Adzuna not configured' as a clear 503 and handles malformed ML output", async () => {
    const a = await signedIn("a@example.com");
    mockMl(() => ({ status: 503, json: { detail: "Job search is unavailable: Adzuna is not configured" } }));
    const res = await a.post("/api/v1/jobs/search").send({ role: "Developer" });
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/Adzuna is not configured/);
    vi.restoreAllMocks();
    mockMl(() => ({ json: { results: "nope" } }));
    expect((await a.post("/api/v1/jobs/search").send({ role: "Developer" })).status).toBe(502);
  });

  it("returns an empty result list cleanly", async () => {
    const a = await signedIn("a@example.com");
    mockMl(() => ({ json: { fetched: 0, mode: "rule-only", results: [] } }));
    const res = await a.post("/api/v1/jobs/search").send({ role: "Underwater Basket Weaver" });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });
});

describe("scam screening", () => {
  it("screens pasted text and returns the evidence", async () => {
    const a = await signedIn("a@example.com");
    const spy = mockMl(() => ({ json: screening("high", ["h1", "h4"]) }));
    const text = "Pay a registration fee and email hr@gmail.com to start immediately.";
    const res = await a.post("/api/v1/jobs/screen").send({ text });
    expect(res.status).toBe(200);
    expect(res.body.screening.band).toBe("high");
    expect(res.body.screening.fired.map((f: { id: string }) => f.id)).toEqual(["h1", "h4"]);
    expect(JSON.parse(spy.mock.calls.find((c) => String(c[0]).includes("/screen"))![1]!.body as string)).toEqual({ text });
  });

  it("validates and requires auth", async () => {
    expect((await request(app).post("/api/v1/jobs/screen").send({ text: "x".repeat(30) })).status).toBe(401);
    const a = await signedIn("a@example.com");
    expect((await a.post("/api/v1/jobs/screen").send({ text: "short" })).status).toBe(400);
  });
});

describe("safeUrl", () => {
  it("allows only http(s)", () => {
    expect(safeUrl("https://x.com/a")).toBe("https://x.com/a");
    expect(safeUrl("http://x.com")).toBe("http://x.com/");
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "ftp://x", "not a url", ""]) expect(safeUrl(bad)).toBe("");
  });
});
