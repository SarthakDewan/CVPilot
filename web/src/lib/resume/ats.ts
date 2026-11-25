import { resumeToText } from "./parser";
import type { AtsCategory, AtsReport, AtsTip, ParsedResume } from "./types";

const STRONG_VERBS = new Set(
  `led built designed developed implemented reduced increased improved created launched migrated optimized automated delivered managed mentored established architected analyzed streamlined drove achieved generated negotiated spearheaded engineered deployed owned scaled shipped resolved coordinated executed forecasted introduced collaborated cleaned wrote raised boosted eliminated cut saved lowered lifted monitored integrated maintained organized produced trained transformed initiated modernized refactored researched presented supported planned directed expanded accelerated reached grew`.split(/\s+/),
);
const WEAK_PHRASES = /\b(responsible for|worked on|helped( with)?|was in charge of|duties included|assisted with|various tasks)\b/i;
const KNOWN_TERMS = `javascript typescript python java go golang rust c++ c# ruby php sql nosql r scala kotlin swift react redux next.js vue angular node.js express graphql rest django flask spring html css tailwind sass postgresql mysql mongodb redis dynamodb snowflake bigquery aws azure gcp docker kubernetes terraform jenkins ci/cd git github linux agile scrum kanban jira microservices serverless tdd testing jest cypress selenium pandas numpy scikit-learn tensorflow pytorch tableau looker etl airflow spark hadoop statistics forecasting seo sem hubspot salesforce mailchimp canva copywriting figma photoshop leadership mentoring communication stakeholder budget security roi conversion`.split(/\s+/);
const MULTI = [
  "power bi", "a/b testing", "data visualization", "machine learning", "google analytics", "content marketing",
  "social media", "email marketing", "paid search", "lead generation", "project management", "system design",
];
const STOP = new Set(
  `the and for with you our will are have has that this from your who their its into able must other more plus bonus required experience experiences knowledge looking seeking hiring team teams work works working strong skills skill years year across using use build run own part within about such including include also well they them all any can new role candidate ideal responsibilities requirements google paid lead analytics search generation`.split(/\s+/),
);

export function hasTerm(hay: string, term: string): boolean {
  const esc = term.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, "i").test(hay);
}

export function extractKeywords(jd: string): string[] {
  const low = jd.toLowerCase();
  const out: string[] = [];
  const add = (t: string) => { if (!out.includes(t)) out.push(t); };
  MULTI.filter((m) => low.includes(m)).forEach(add);
  KNOWN_TERMS.filter((t) => hasTerm(low, t)).forEach(add);
  const freq: Record<string, number> = {};
  for (const w of low.match(/[a-z][a-z+#./-]{2,}/g) ?? []) if (!STOP.has(w)) freq[w] = (freq[w] ?? 0) + 1;
  Object.entries(freq)
    .filter(([w, c]) => c >= 2 && !w.includes("/"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([w]) => add(w));
  return out.slice(0, 28);
}

export function scoreResume(R: ParsedResume, jdText: string): AtsReport {
  const cats: AtsCategory[] = [];
  const tips: AtsTip[] = [];
  const tip = (sev: AtsTip["sev"], msg: string) => tips.push({ sev, msg });
  const bullets = [...R.experience.flatMap((e) => e.bullets), ...R.projects.flatMap((p) => p.bullets)];
  const full = resumeToText(R);
  const fullLow = full.toLowerCase();

  // 1 Contact (10)
  let c = 0;
  const cn: string[] = [];
  if (R.name) c += 1; else cn.push("name");
  if (R.email) c += 3; else { cn.push("email"); tip("high", "Add an email address – recruiters and ATS need a way to contact you."); }
  if (R.phone) c += 3; else { cn.push("phone"); tip("high", "Add a phone number."); }
  if (R.location) c += 1; else { cn.push("location"); tip("low", "Add your city and state/country."); }
  if (R.linkedin) c += 2; else { cn.push("LinkedIn"); tip("med", "Add your LinkedIn profile URL."); }
  cats.push({ name: "Contact information", score: c, max: 10, note: cn.length ? "Missing: " + cn.join(", ") : "All key contact details found" });

  // 2 Sections (15)
  let s = 0;
  const sn: string[] = [];
  if (R.summary.length >= 60) s += 4;
  else { sn.push(R.summary ? "longer summary" : "summary"); tip("med", R.summary ? "Expand your summary to 2–3 sentences with your years of experience and key skills." : "Add a professional summary (2–3 sentences) at the top."); }
  if (R.experience.length) s += 5; else { sn.push("experience"); tip("high", 'No work experience section was detected – use a clear heading like "Experience".'); }
  if (R.education.length) s += 3; else { sn.push("education"); tip("med", "Add an Education section."); }
  if (R.skills.length) s += 3; else { sn.push("skills"); tip("high", "Add a Skills section with the tools and technologies you use."); }
  cats.push({ name: "Section structure", score: s, max: 15, note: sn.length ? "Needs: " + sn.join(", ") : "All standard sections present" });

  // 3 Keywords (30)
  const kws = jdText.trim() ? extractKeywords(jdText) : [];
  const hit = kws.filter((k) => hasTerm(fullLow, k));
  const miss = kws.filter((k) => !hasTerm(fullLow, k));
  let ks: number;
  let kn: string;
  if (kws.length) {
    ks = (30 * hit.length) / kws.length;
    kn = `${hit.length} of ${kws.length} job keywords found`;
    if (miss.length) tip(miss.length > kws.length / 2 ? "high" : "med", `Work in missing keywords where truthful: ${miss.slice(0, 6).join(", ")}${miss.length > 6 ? "…" : ""}.`);
  } else { ks = Math.min(30, R.skills.length * 1.5); kn = "No job description selected – scored on skills breadth"; }
  cats.push({ name: "Keyword match", score: ks, max: 30, note: kn });

  // 4 Impact (15)
  const quant = bullets.filter((b) => /\d/.test(b) || /[%$]/.test(b)).length;
  const qr = bullets.length ? quant / bullets.length : 0;
  if (!bullets.length) tip("high", "Add bullet points under each role describing what you achieved.");
  else if (qr < 0.6) tip(qr < 0.3 ? "high" : "med", `Only ${quant} of ${bullets.length} bullets include numbers. Quantify results (%, $, time saved, users, team size).`);
  cats.push({ name: "Quantified impact", score: Math.min(1, qr / 0.6) * 15, max: 15, note: bullets.length ? `${quant}/${bullets.length} bullets contain metrics` : "No bullets found" });

  // 5 Action verbs (10)
  const first = (b: string) => (b.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const strong = bullets.filter((b) => STRONG_VERBS.has(first(b))).length;
  const weak = bullets.filter((b) => WEAK_PHRASES.test(b)).length;
  const vr = bullets.length ? strong / bullets.length : 0;
  if (weak) tip("med", `${weak} bullet${weak > 1 ? "s use" : " uses"} weak phrasing ("responsible for", "helped with", "worked on"). Start with a strong verb like Led, Built, Reduced.`);
  if (bullets.length && vr < 0.7) tip("low", `Start more bullets with action verbs (${strong}/${bullets.length} do now).`);
  cats.push({ name: "Action verbs", score: Math.max(0, Math.min(1, vr / 0.7) * 10 - weak), max: 10, note: bullets.length ? `${strong}/${bullets.length} bullets start with a strong verb${weak ? `, ${weak} weak` : ""}` : "—" });

  // 6 Format (10)
  const words = full.split(/\s+/).filter(Boolean).length;
  let f = 0;
  const fn: string[] = [];
  if (words >= 350 && words <= 900) f += 4;
  else if (words >= 200) { f += 2; fn.push(words < 350 ? "a bit short" : "a bit long"); }
  else fn.push("too short");
  if (words < 350) tip("med", `Resume is ${words} words – aim for 350–900 to give ATS enough content.`);
  else if (words > 900) tip("low", `Resume is ${words} words – consider trimming to 1–2 pages.`);
  const avgLen = bullets.length ? bullets.reduce((a, b) => a + b.split(/\s+/).length, 0) / bullets.length : 0;
  if (avgLen >= 8 && avgLen <= 28) f += 3;
  else if (bullets.length) { fn.push(avgLen < 8 ? "bullets too brief" : "bullets too long"); tip("low", avgLen < 8 ? "Bullets are very short – add context and results." : "Bullets are long – keep them under ~25 words."); }
  if (!/\b(I|my|me)\b/.test(full)) f += 2; else { fn.push("first-person pronouns"); tip("low", 'Avoid "I", "my" – write in implied first person.'); }
  if (R.skills.length >= 8) f += 1; else if (R.skills.length) tip("low", "List at least 8 relevant skills.");
  cats.push({ name: "Length & formatting", score: f, max: 10, note: `${words} words` + (fn.length ? " · " + fn.join(", ") : " · looks good") });

  // 7 Dates / completeness (10)
  let d = 0;
  const dn: string[] = [];
  const ex = R.experience;
  if (ex.length) {
    const withDates = ex.filter((e) => e.start).length;
    const withBoth = ex.filter((e) => e.title && e.company).length;
    d += (6 * withDates) / ex.length + (2 * withBoth) / ex.length;
    if (withDates < ex.length) { dn.push("missing dates"); tip("med", "Some jobs have no dates – ATS uses dates to calculate experience."); }
    if (withBoth < ex.length) { dn.push("missing title/company"); tip("med", "Each job should have both a title and a company name."); }
  } else dn.push("no experience");
  if (R.education.length && R.education.every((e) => e.year)) d += 2;
  else if (R.education.length) { dn.push("education year"); tip("low", "Add graduation years to your education entries."); }
  cats.push({ name: "Dates & job details", score: d, max: 10, note: dn.length ? "Issues: " + dn.join(", ") : "Dates and titles complete" });

  const order = { high: 0, med: 1, low: 2 } as const;
  tips.sort((a, b) => order[a.sev] - order[b.sev]);
  return { total: Math.round(cats.reduce((a, x) => a + x.score, 0)), cats, hit, miss, kwCount: kws.length, tips };
}
