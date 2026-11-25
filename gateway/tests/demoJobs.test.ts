import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobListing } from "../src/models/JobListing.js";
import { removeDemoJobs, seedDemoJobs } from "../src/seedJobs.js";
import { generateDemoListings } from "../src/services/demoJobs.js";

describe("generateDemoListings", () => {
  const jobs = generateDemoListings(1000);

  it("makes 1000 unique, deterministic listings", () => {
    expect(jobs).toHaveLength(1000);
    expect(new Set(jobs.map((j) => j.sourceId)).size).toBe(1000);
    expect(generateDemoListings(1000).map((j) => j.title)).toEqual(jobs.map((j) => j.title));
  });

  it("fills every field with plausible values", () => {
    for (const j of jobs) {
      expect(j.source).toBe("demo");
      expect(j.title && j.company && j.location && j.description.length > 80).toBeTruthy();
      expect(j.salary.max).toBeGreaterThan(j.salary.min);
      expect(j.requiredSkills.length).toBeGreaterThanOrEqual(4);
      expect(j.scamRisk.score).toBeGreaterThanOrEqual(0);
      expect(j.scamRisk.score).toBeLessThanOrEqual(1);
    }
  });

  it("has a realistic mix of safe, caution and high-risk listings, with reasons for the risky ones", () => {
    const n = (b: string) => jobs.filter((j) => j.scamRisk.band === b).length;
    expect(n("safe")).toBeGreaterThan(800);
    expect(n("caution")).toBeGreaterThan(30);
    expect(n("high")).toBeGreaterThan(10);
    expect(jobs.filter((j) => j.scamRisk.band !== "safe").every((j) => j.scamRisk.reasons.length === 1)).toBe(true);
  });
});

describe("seedDemoJobs", () => {
  let mongod: MongoMemoryServer;
  beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await JobListing.init(); });
  afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

  it("is idempotent and removal leaves real listings alone", async () => {
    await JobListing.create({ source: "adzuna", sourceId: "real-1", title: "Real job", description: "x" });
    await seedDemoJobs(1000);
    await seedDemoJobs(1000);
    expect(await JobListing.countDocuments({ source: "demo" })).toBe(1000);
    await removeDemoJobs();
    expect(await JobListing.countDocuments({ source: "demo" })).toBe(0);
    expect(await JobListing.countDocuments({ source: "adzuna" })).toBe(1);
  });
});
