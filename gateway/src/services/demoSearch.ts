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
async function demoPool(location: string) {
  if (!(await JobListing.exists({ source: DEMO_SOURCE }))) await seedDemoJobs(1000);
  const all = await JobListing.find({ source: DEMO_SOURCE }).lean();
  const loc = location.trim().toLowerCase();
  const pool = loc ? all.filter((j) => (j.location ?? "").toLowerCase().includes(loc)) : all;
  return pool.length ? pool : all;
}

const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return Math.round((sorted[lo] ?? 0) + ((sorted[Math.min(lo + 1, sorted.length - 1)] ?? 0) - (sorted[lo] ?? 0)) * (pos - lo));
};

/** Market aggregate (skill demand + salary stats) over the demo listings whose title matches the role. */
export async function aggregateDemoMarket(role: string, location: string) {
  const roleTokens = tokens(role).filter((t) => !STOP.has(t));
  const matching = (await demoPool(location)).filter((j) => {
    const t = new Set(tokens(j.title));
    return roleTokens.length > 0 && roleTokens.every((x) => t.has(x));
  });
  const skill_counts: Record<string, number> = {};
  for (const j of matching) for (const s of new Set(j.requiredSkills ?? [])) skill_counts[s] = (skill_counts[s] ?? 0) + 1;
  const mids = matching
    .map((j) => (j.salary?.min != null && j.salary?.max != null ? (j.salary.min + j.salary.max) / 2 : null))
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  const salary = mids.length
    ? {
        count: mids.length, min: Math.round(mids[0] ?? 0), max: Math.round(mids[mids.length - 1] ?? 0),
        mean: Math.round(mids.reduce((a, b) => a + b, 0) / mids.length), median: quantile(mids, 0.5),
        p25: quantile(mids, 0.25), p75: quantile(mids, 0.75), currency: "INR",
      }
    : null;
  return { n: matching.length, skill_counts, salary, salary_predicted_share: 0, listings: [] as never[] };
}

export async function searchDemoJobs({ role, location, skills, k }: DemoSearchInput) {
  const candidates = await demoPool(location);

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
