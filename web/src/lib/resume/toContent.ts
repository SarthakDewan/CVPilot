import type { ResumeContent } from "../types";
import { emptyContent } from "../types";
import type { ParsedResume } from "./types";

const cut = (s: string, n: number) => s.trim().slice(0, n);
const CURRENT = /^(present|current|now)$/i;

/** "2011 – 2015" / "Mar 2021" -> {start, end}. */
function splitYears(s: string): { start: string; end: string } {
  const m = s.split(/\s*(?:-|–|—|\bto\b)\s*/i);
  return { start: cut(m[0] ?? "", 20), end: cut(m[1] ?? "", 20) };
}

/** Maps what the parser found onto the resume builder's schema, respecting its length limits. */
export function parsedToContent(p: ParsedResume): ResumeContent {
  const c = emptyContent();
  c.basics = {
    fullName: cut(p.name, 120), headline: cut(p.title, 160), email: cut(p.email, 254), phone: cut(p.phone, 40), location: cut(p.location, 120),
    links: [
      p.linkedin && { label: "LinkedIn", url: cut(p.linkedin, 300) },
      p.github && { label: "GitHub", url: cut(p.github, 300) },
      p.website && { label: "Website", url: cut(p.website, 300) },
    ].filter((x): x is { label: string; url: string } => Boolean(x)),
  };
  c.summary = cut(p.summary, 1500);
  c.skills = p.skills.map((s) => cut(s, 60)).filter(Boolean).slice(0, 80);
  c.experience = p.experience.slice(0, 15).map((e) => {
    const current = CURRENT.test(e.end.trim());
    return {
      company: cut(e.company, 120), role: cut(e.title, 120), location: cut(e.location, 120),
      start: cut(e.start, 20), end: current ? "" : cut(e.end, 20), current,
      bullets: e.bullets.map((b) => cut(b, 400)).filter(Boolean).slice(0, 15),
    };
  });
  c.projects = p.projects.slice(0, 15).map((pr) => {
    const [desc, ...tech] = pr.desc.split(/\s*\|\s*/);
    return {
      name: cut(pr.name, 120), link: "", description: cut(desc ?? "", 600),
      tech: tech.join(",").split(/\s*,\s*/).map((t) => cut(t, 40)).filter(Boolean).slice(0, 20),
      bullets: pr.bullets.map((b) => cut(b, 400)).filter(Boolean).slice(0, 15),
    };
  });
  c.education = p.education.slice(0, 10).map((e) => {
    const { start, end } = splitYears(e.year);
    return { institution: cut(e.school, 160), degree: cut(e.degree, 120), field: "", start: end ? start : "", end: end || start, grade: cut(e.gpa, 40) };
  });
  c.achievements = p.awards.map((a) => cut(a, 400)).filter(Boolean).slice(0, 20);
  c.certifications = p.certs.slice(0, 20).map((raw) => {
    const year = /\b((?:19|20)\d{2})\b/.exec(raw)?.[1] ?? "";
    return { name: cut(raw.replace(/\s*\(\s*(?:19|20)\d{2}\s*\)\s*$/, ""), 160), issuer: "", year };
  });
  return c;
}
