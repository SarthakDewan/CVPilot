import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { loadConfig } from "./config.js";
import { Resume } from "./models/Resume.js";
import { User } from "./models/User.js";
import { hashPassword } from "./services/auth.js";
import { resumeContentSchema } from "./services/resumeSchema.js";

export const DEMO_EMAIL = "demo@cvpilot.local";

/**
 * Creates ONE demo account and ONE demo resume. Everything it writes is labelled "DEMO DATA".
 * It creates no listings, scores, insights or roadmaps: those come only from real analysis.
 */
export async function seedDemo(bcryptCost: number, password: string) {
  let user = await User.findOne({ email: DEMO_EMAIL });
  if (!user) {
    user = await User.create({
      email: DEMO_EMAIL,
      passwordHash: await hashPassword(password, bcryptCost),
      profile: { fullName: "Demo User (DEMO DATA)", location: "Bengaluru", preferredRoles: ["Data Analyst"], skills: ["SQL", "Python"] },
    });
  }
  const title = "[DEMO DATA] Sample resume";
  if (!(await Resume.exists({ userId: user._id, title }))) {
    await Resume.create({
      userId: user._id,
      title,
      templateId: "modern",
      content: resumeContentSchema.parse({
        basics: { fullName: "Demo User", headline: "DEMO DATA – not a real person", email: DEMO_EMAIL, location: "Bengaluru" },
        summary: "DEMO DATA: sample text so you can try the builder, exports and ATS check. Replace it with your own details.",
        skills: ["SQL", "Python", "Excel", "Tableau", "Statistics"],
        experience: [{ company: "Example Co (demo)", role: "Data Analyst (demo)", start: "2022", current: true, bullets: ["DEMO DATA: sample bullet point describing an achievement."] }],
        education: [{ institution: "Example University (demo)", degree: "B.Sc.", field: "Statistics", start: "2018", end: "2021" }],
      }),
    });
  }
  return user;
}

async function main() {
  const cfg = loadConfig();
  if (cfg.isProd && !process.argv.includes("--force")) {
    console.error("Refusing to seed demo data with NODE_ENV=production (pass --force if you really mean it).");
    process.exit(1);
  }
  const password = process.env.SEED_DEMO_PASSWORD ?? randomBytes(9).toString("base64url");
  await mongoose.connect(cfg.mongoUri);
  const existed = await User.exists({ email: DEMO_EMAIL });
  await seedDemo(cfg.bcryptCost, password);
  console.log(existed ? `Demo account already exists (${DEMO_EMAIL}); password unchanged.` : `Created demo account ${DEMO_EMAIL}\npassword: ${password}`);
  console.log("All seeded content is labelled DEMO DATA.");
  await mongoose.disconnect();
}

if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
