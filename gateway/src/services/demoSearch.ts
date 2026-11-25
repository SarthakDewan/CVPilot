import { JobListing } from "../models/JobListing.js";
import { seedDemoJobs } from "../seedJobs.js";
import { DEMO_SOURCE } from "./demoJobs.js";

export interface DemoSearchInput { role: string; location: string; skills: string[]; k: number }

const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9+#.]+/g) ?? [];
const STOP = new Set(["the", "and", "for", "of", "a", "in"]);

/**
 * Ranks the fictional "demo" listings against a role, location and skill list.
 * Used only when DEMO_JOBS=1 and the live Adzuna search is unavailable. Seeds 1000 listings on first use.
 */
export async function searchDemoJobs({ role, location, skills, k }: DemoSearchInput) {
  if (!(await JobListing.exists({ source: DEMO_SOURCE }))) await seedDemoJobs(1000);
  const all = await JobListing.find({ source: DEMO_SOURCE }).lean();

  const loc = location.trim().toLowerCase();
  const pool = loc ? all.filter((j) => (j.location ?? "").toLowerCase().includes(loc)) : all;
  const candidates = pool.length ? pool : all;

  const roleTokens = tokens(role).filter((t) => !STOP.has(t));
  const mine = new Map(skills.map((x) => [x.toLowerCase(), x]));

  const ranked = candidates
    .map((j) => {
      const titleTokens = new Set(tokens(j.title));
      const titleHit = roleTokens.length ? roleTokens.filter((t) => titleTokens.has(t)).length / roleTokens.length : 0;
      const jobSkills = j.requiredSkills ?? [];
      const matched = jobSkills.filter((x) => mine.has(x.toLowerCase()));
      const skillRatio = jobSkills.length ? matched.length / jobSkills.length : 0;
      const score = Math.round(Math.min(1, 0.6 * titleHit + 0.4 * (mine.size ? Math.min(1, skillRatio * 1.5) : 0)) * 100);
      return { j, score, matched, titleHit };
    })
    .filter((r) => r.titleHit > 0 || r.matched.length > 0)
    .sort((a, b) => b.score - a.score || a.j.sourceId.localeCompare(b.j.sourceId));

  const results = ranked.slice(0, k).map(({ j, score, matched }) => {
    const risk = j.scamRisk?.score ?? 0;
    const reasons = j.scamRisk?.reasons ?? [];
    return {
      id: j.sourceId,
      title: j.title,
      company: j.company ?? "",
      location: j.location ?? "",
      description: j.description,
      url: j.url ?? "",
      salary: { min: j.salary?.min ?? null, max: j.salary?.max ?? null, currency: j.salary?.currency ?? "INR", predicted: false },
      score,
      cosine: score / 100,
      matchedTerms: matched,
      scam: {
        rho: risk, p_clf: null, risk, band: j.scamRisk?.band ?? "safe", mode: "rule-only" as const,
        fired: reasons.map((reason, i) => ({ id: `demo${i + 1}`, name: reason, reason, evidence: "Demo listing wording" })),
        checked: [],
      },
    };
  });
  return { mode: "rule-only" as const, fetched: ranked.length, source: "demo" as const, results };
}
