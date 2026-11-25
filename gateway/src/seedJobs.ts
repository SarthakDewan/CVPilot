import mongoose from "mongoose";
import { loadConfig } from "./config.js";
import { JobListing } from "./models/JobListing.js";
import { DEMO_SOURCE, generateDemoListings } from "./services/demoJobs.js";

/** Inserts (or refreshes) `count` fictional DEMO listings with source "demo". Safe to re-run. */
export async function seedDemoJobs(count = 1000) {
  const docs = generateDemoListings(count);
  await JobListing.bulkWrite(
    docs.map((d) => ({ updateOne: { filter: { source: d.source, sourceId: d.sourceId }, update: { $set: d }, upsert: true } })),
    { ordered: false },
  );
  return docs.length;
}

export const removeDemoJobs = () => JobListing.deleteMany({ source: DEMO_SOURCE });

async function main() {
  const cfg = loadConfig();
  if (cfg.isProd && !process.argv.includes("--force")) {
    console.error("Refusing to seed demo listings with NODE_ENV=production (pass --force if you really mean it).");
    process.exit(1);
  }
  await mongoose.connect(cfg.mongoUri);
  if (process.argv.includes("--remove")) {
    const r = await removeDemoJobs();
    console.log(`Removed ${r.deletedCount} demo listings (real Adzuna listings untouched).`);
  } else {
    const n = Number(process.argv.find((a) => a.startsWith("--count="))?.split("=")[1] ?? 1000);
    console.log(`Upserted ${await seedDemoJobs(n)} demo listings (source "demo"). Total demo in DB: ${await JobListing.countDocuments({ source: DEMO_SOURCE })}.`);
  }
  await mongoose.disconnect();
}

if (process.argv[1]?.endsWith("seedJobs.ts") || process.argv[1]?.endsWith("seedJobs.js")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
