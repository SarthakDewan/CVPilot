import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { Resume } from "../src/models/Resume.js";
import { User } from "../src/models/User.js";
import { hashShareToken } from "../src/services/shareToken.js";

let mongod: MongoMemoryServer;
let app: ReturnType<typeof createApp>;

const content = {
  basics: { fullName: "Ada Lovelace", headline: "Software Engineer", email: "ada@example.com" },
  summary: "Engineer who builds reliable systems.",
  skills: ["TypeScript", "MongoDB"],
  experience: [{ company: "Analytical Engines", role: "Engineer", start: "2020", current: true, bullets: ["Built a compiler"] }],
};

async function signedIn(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/register").send({ email, password: "a-long-password" });
  return agent;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([User.init(), Resume.init()]);
  app = createApp(
    loadConfig({
      NODE_ENV: "test",
      MONGODB_URI: mongod.getUri(),
      JWT_SECRET: "t".repeat(40),
      ML_SERVICE_URL: "http://ml.invalid",
      ML_SHARED_SECRET: "shh",
    }),
  );
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Resume.deleteMany({})]);
});
afterEach(() => vi.restoreAllMocks());

describe("resume CRUD", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/v1/resumes")).status).toBe(401);
  });

  it("creates, lists, reads, updates and deletes", async () => {
    const a = await signedIn("a@example.com");
    const created = await a.post("/api/v1/resumes").send({ title: "My CV", templateId: "modern", content });
    expect(created.status).toBe(201);
    const id = created.body.resume.id as string;
    expect(created.body.resume.content.skills).toEqual(["TypeScript", "MongoDB"]);

    expect((await a.get("/api/v1/resumes")).body.resumes).toHaveLength(1);
    expect((await a.get(`/api/v1/resumes/${id}`)).body.resume.title).toBe("My CV");

    const upd = await a.put(`/api/v1/resumes/${id}`).send({ templateId: "compact" });
    expect(upd.body.resume.templateId).toBe("compact");
    expect(upd.body.resume.title).toBe("My CV");

    expect((await a.delete(`/api/v1/resumes/${id}`)).status).toBe(204);
    expect((await a.get(`/api/v1/resumes/${id}`)).status).toBe(404);
  });

  it("validates input (unknown template, empty update, overlong bullet)", async () => {
    const a = await signedIn("a@example.com");
    expect((await a.post("/api/v1/resumes").send({ title: "x", templateId: "fancy" })).status).toBe(400);
    const { body } = await a.post("/api/v1/resumes").send({ title: "x" });
    const id = body.resume.id as string;
    expect((await a.put(`/api/v1/resumes/${id}`).send({})).status).toBe(400);
    const long = { experience: [{ company: "c", role: "r", bullets: ["z".repeat(401)] }] };
    expect((await a.put(`/api/v1/resumes/${id}`).send({ content: long })).status).toBe(400);
  });

  it("isolates users: other users get 404 for read, update, delete, share and export", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    const id = (await a.post("/api/v1/resumes").send({ title: "Private" })).body.resume.id as string;

    expect((await b.get(`/api/v1/resumes/${id}`)).status).toBe(404);
    expect((await b.put(`/api/v1/resumes/${id}`).send({ title: "pwned" })).status).toBe(404);
    expect((await b.post(`/api/v1/resumes/${id}/share`).send({})).status).toBe(404);
    expect((await b.get(`/api/v1/resumes/${id}/export?format=pdf`)).status).toBe(404);
    expect((await b.delete(`/api/v1/resumes/${id}`)).status).toBe(404);
    expect((await b.get("/api/v1/resumes")).body.resumes).toHaveLength(0);
    expect((await a.get(`/api/v1/resumes/${id}`)).body.resume.title).toBe("Private");
  });

  it("returns 404 for malformed ids", async () => {
    const a = await signedIn("a@example.com");
    expect((await a.get("/api/v1/resumes/not-an-id")).status).toBe(404);
  });
});

describe("sharing", () => {
  it("shares, serves a public read-only view, then revokes", async () => {
    const a = await signedIn("a@example.com");
    const id = (await a.post("/api/v1/resumes").send({ title: "Shared", content })).body.resume.id as string;

    const share = await a.post(`/api/v1/resumes/${id}/share`).send({});
    expect(share.status).toBe(201);
    const token = share.body.token as string;
    expect(token.length).toBeGreaterThanOrEqual(40);

    // Only the hash is stored.
    const stored = await Resume.findById(id);
    expect(stored?.share?.tokenHash).toBe(hashShareToken(token));
    expect(JSON.stringify(stored?.toObject())).not.toContain(token);

    const pub = await request(app).get(`/api/v1/public/resumes/${token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.resume.content.basics.fullName).toBe("Ada Lovelace");
    expect(pub.headers["x-robots-tag"]).toMatch(/noindex/);
    expect(JSON.stringify(pub.body)).not.toMatch(/userId|ats|tokenHash/);

    expect((await a.get(`/api/v1/resumes/${id}`)).body.resume.shared).toBe(true);
    expect((await a.delete(`/api/v1/resumes/${id}/share`)).status).toBe(204);
    expect((await request(app).get(`/api/v1/public/resumes/${token}`)).status).toBe(404);
    expect((await a.get(`/api/v1/resumes/${id}`)).body.resume.shared).toBe(false);
  });

  it("re-sharing rotates the token so the old link stops working", async () => {
    const a = await signedIn("a@example.com");
    const id = (await a.post("/api/v1/resumes").send({ title: "Rotate" })).body.resume.id as string;
    const t1 = (await a.post(`/api/v1/resumes/${id}/share`).send({})).body.token as string;
    const t2 = (await a.post(`/api/v1/resumes/${id}/share`).send({})).body.token as string;
    expect(t1).not.toBe(t2);
    expect((await request(app).get(`/api/v1/public/resumes/${t1}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/public/resumes/${t2}`)).status).toBe(200);
  });

  it("honours link expiry", async () => {
    const a = await signedIn("a@example.com");
    const id = (await a.post("/api/v1/resumes").send({ title: "Expiring" })).body.resume.id as string;
    const token = (await a.post(`/api/v1/resumes/${id}/share`).send({ expiresInDays: 7 })).body.token as string;
    expect((await request(app).get(`/api/v1/public/resumes/${token}`)).status).toBe(200);
    await Resume.updateOne({ _id: id }, { $set: { "share.expiresAt": new Date(Date.now() - 1000) } });
    expect((await request(app).get(`/api/v1/public/resumes/${token}`)).status).toBe(404);
  });

  it("rejects guessed tokens", async () => {
    expect((await request(app).get("/api/v1/public/resumes/" + "A".repeat(43))).status).toBe(404);
    expect((await request(app).get("/api/v1/public/resumes/short")).status).toBe(404);
  });
});

describe("export", () => {
  it.each([
    ["pdf", "application/pdf", "%PDF"],
    ["docx", "wordprocessingml", "PK"],
  ])("exports %s for every template", async (format, mime, magic) => {
    const a = await signedIn("a@example.com");
    for (const templateId of ["classic", "modern", "compact"]) {
      const id = (await a.post("/api/v1/resumes").send({ title: `T ${templateId}`, templateId, content })).body.resume.id as string;
      const res = await a
        .get(`/api/v1/resumes/${id}/export?format=${format}`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on("data", (c: Buffer) => chunks.push(c));
          r.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain(mime);
      expect(res.headers["content-disposition"]).toContain(`.${format}`);
      expect((res.body as Buffer).subarray(0, magic.length).toString("latin1")).toBe(magic);
    }
  });

  it("rejects unknown formats", async () => {
    const a = await signedIn("a@example.com");
    const id = (await a.post("/api/v1/resumes").send({ title: "x" })).body.resume.id as string;
    expect((await a.get(`/api/v1/resumes/${id}/export?format=exe`)).status).toBe(400);
  });
});

describe("suggestions proxy", () => {
  it("forwards only the snippet with the shared secret and returns suggestions", async () => {
    const a = await signedIn("a@example.com");
    const real = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).startsWith("http://ml.invalid")) {
        return new Response(JSON.stringify({ suggestions: ["Built X"] }), { status: 200 });
      }
      return real(input, init);
    });
    const res = await a.post("/api/v1/resumes/suggest").send({ kind: "bullet", text: "worked on the compiler thing" });
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual(["Built X"]);
    const call = spy.mock.calls.find((c) => String(c[0]).includes("ml.invalid"))!;
    expect(String(call[0])).toBe("http://ml.invalid/suggest");
    expect((call[1]!.headers as Record<string, string>)["x-ml-secret"]).toBe("shh");
    expect(JSON.parse(call[1]!.body as string)).toEqual({ kind: "bullet", text: "worked on the compiler thing" });
  });

  it("maps a not-configured ML feature to a clear 503", async () => {
    const a = await signedIn("a@example.com");
    const real = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
      String(input).startsWith("http://ml.invalid")
        ? new Response(JSON.stringify({ detail: "Gemini is not configured" }), { status: 503 })
        : real(input, init),
    );
    const res = await a.post("/api/v1/resumes/suggest").send({ kind: "summary", text: "a reasonably long summary text" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("feature_unavailable");
  });
});

describe("ATS analysis", () => {
  const JD = "We are hiring a Python engineer with SQL, Kubernetes and Terraform experience to build APIs. ".repeat(2);
  const mlReply = {
    score: 64, cosine: 0.6412, matched: ["Python", "SQL"], missing: ["Kubernetes", "Terraform"],
    explanation: "Decent overlap.", explanation_source: "template", model: "all-MiniLM-L6-v2",
    truncated_resume: false, truncated_job: false,
  };

  function mockMl(reply: unknown = mlReply, status = 200) {
    const real = globalThis.fetch;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
      String(input).startsWith("http://ml.invalid") ? new Response(JSON.stringify(reply), { status }) : real(input, init),
    );
  }
  async function resumeWith(agent: ReturnType<typeof request.agent>, c: unknown = content) {
    return (await agent.post("/api/v1/resumes").send({ title: "CV", content: c })).body.resume.id as string;
  }

  it("scores via the ML service, stores the evidence, and sends only text + secret", async () => {
    const a = await signedIn("a@example.com");
    const id = await resumeWith(a);
    const spy = mockMl();
    const res = await a.post(`/api/v1/resumes/${id}/analyze`).send({ jobDescription: JD });
    expect(res.status).toBe(200);
    expect(res.body.analysis).toMatchObject({ score: 64, matched: ["Python", "SQL"], missing: ["Kubernetes", "Terraform"], explanationSource: "template" });

    const call = spy.mock.calls.find((c) => String(c[0]).includes("ml.invalid"))!;
    expect(String(call[0])).toBe("http://ml.invalid/score");
    const sent = JSON.parse(call[1]!.body as string);
    expect(Object.keys(sent).sort()).toEqual(["job_description", "resume_text"]);
    expect(sent.resume_text).toContain("Ada Lovelace");
    expect(sent.resume_text).toContain("TypeScript");
    expect((call[1]!.headers as Record<string, string>)["x-ml-secret"]).toBe("shh");

    const stored = (await a.get(`/api/v1/resumes/${id}`)).body.resume.ats;
    expect(stored.score).toBe(64);
    expect(stored.missing).toEqual(["Kubernetes", "Terraform"]);
    expect((await a.get("/api/v1/resumes")).body.resumes[0].atsScore).toBe(64);
  });

  it("clears the stored analysis when the resume content changes", async () => {
    const a = await signedIn("a@example.com");
    const id = await resumeWith(a);
    mockMl();
    await a.post(`/api/v1/resumes/${id}/analyze`).send({ jobDescription: JD });
    await a.put(`/api/v1/resumes/${id}`).send({ content: { ...content, skills: ["Rust"] } });
    expect((await a.get(`/api/v1/resumes/${id}`)).body.resume.ats).toBeNull();
  });

  it("validates input, rejects empty resumes, and isolates users", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    const id = await resumeWith(a);
    mockMl();
    expect((await a.post(`/api/v1/resumes/${id}/analyze`).send({ jobDescription: "too short" })).status).toBe(400);
    expect((await a.post(`/api/v1/resumes/${id}/analyze`).send({})).status).toBe(400);
    expect((await b.post(`/api/v1/resumes/${id}/analyze`).send({ jobDescription: JD })).status).toBe(404);
    const emptyId = await resumeWith(a, {});
    const empty = await a.post(`/api/v1/resumes/${emptyId}/analyze`).send({ jobDescription: JD });
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toMatch(/Add some content/);
  });

  it("maps ML failures and malformed ML responses to 502/503 without storing anything", async () => {
    const a = await signedIn("a@example.com");
    const id = await resumeWith(a);
    mockMl({ detail: "Embedding model is unavailable" }, 503);
    expect((await a.post(`/api/v1/resumes/${id}/analyze`).send({ jobDescription: JD })).status).toBe(503);
    vi.restoreAllMocks();
    mockMl({ score: "high" });
    expect((await a.post(`/api/v1/resumes/${id}/analyze`).send({ jobDescription: JD })).status).toBe(502);
    expect((await a.get(`/api/v1/resumes/${id}`)).body.resume.ats).toBeNull();
  });
});

describe("PDF layout regression", () => {
  /** Reads (x, text) for every text run from an uncompressed pdfkit content stream. */
  function textRuns(pdf: string): { x: number; text: string }[] {
    const lines = pdf.split("\n");
    const out: { x: number; text: string }[] = [];
    for (let i = 0; i < lines.length - 1; i++) {
      const tm = /^1 0 0 1 ([\d.]+) [\d.]+ Tm$/.exec(lines[i]!);
      if (!tm) continue;
      let j = i + 1;
      while (j < lines.length && !/TJ\s*$/.test(lines[j]!)) j++; // a font/size line may sit between Tm and the text
      const hex = [...(lines[j] ?? "").matchAll(/<([0-9a-f]+)>/g)].map((m) => m[1]!).join("");
      out.push({ x: Number(tm[1]), text: Buffer.from(hex, "hex").toString("latin1") });
    }
    return out;
  }

  it("keeps every section heading at the left margin, including after bullet lists", async () => {
    const { renderPdf } = await import("../src/services/exporters.js");
    const { resumeContentSchema } = await import("../src/services/resumeSchema.js");
    const content = resumeContentSchema.parse({
      basics: { fullName: "Ada" },
      summary: "Engineer.",
      skills: ["Python"],
      experience: [{ company: "A", role: "B", bullets: ["one", "two"] }],
      projects: [{ name: "P", bullets: ["x"] }],
      education: [{ institution: "U", degree: "B.E." }],
      achievements: ["won"],
      certifications: [{ name: "Cert" }],
    });
    for (const template of ["classic", "modern", "compact"] as const) {
      const runs = textRuns((await renderPdf(content, template, { compress: false })).toString("latin1"));
      const headings = ["summary", "skills", "experience", "projects", "education", "achievements", "certifications"].map((h) =>
        runs.find((r) => r.text.toLowerCase() === h),
      );
      expect(headings.every(Boolean)).toBe(true);
      expect(new Set(headings.map((h) => h!.x)).size).toBe(1); // all headings share one x
      const bullet = runs.find((r) => r.text.includes("one"))!;
      expect(bullet.x).toBeGreaterThan(headings[0]!.x); // bullets stay indented
    }
  });
});
