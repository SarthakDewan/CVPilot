import { emptyResume, type Education, type Experience, type ParsedResume } from "./types";

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
const DATE_RANGE = new RegExp(
  `(?:${MONTH}\\s+)?(?:19|20)\\d{2}\\s*(?:-|–|—|to)\\s*(?:(?:${MONTH}\\s+)?(?:19|20)\\d{2}|Present|Current|Now)`,
  "i",
);
const SINGLE_DATE = new RegExp(`(?:${MONTH}\\s+)?(?:19|20)\\d{2}`, "i");
const BULLET = /^\s*[•\-*▪●◦·‣]\s*/;

type SectionKey = "summary" | "experience" | "education" | "skills" | "projects" | "certs" | "awards";
const SECTIONS: [SectionKey, RegExp][] = [
  ["summary", /^(?:professional\s+|career\s+)?(?:summary|profile|objective|about(?:\s+me)?)$/i],
  ["experience", /^(?:professional\s+|work\s+|relevant\s+)?(?:experience|employment(?:\s+history)?|work\s+history|career\s+history)$/i],
  ["education", /^(?:education(?:\s*(?:&|and)\s*training)?|academic\s+background|academics)$/i],
  ["skills", /^(?:(?:technical|core|key)\s+)?(?:skills|competencies|technologies)(?:\s*(?:&|and)\s*tools)?$/i],
  ["projects", /^(?:personal\s+|key\s+|selected\s+)?projects$/i],
  ["certs", /^(?:certifications?|licenses?(?:\s*(?:&|and)\s*certifications?)?|certificates?)$/i],
  ["awards", /^(?:awards?|achievements?|honou?rs?|awards?\s*(?:&|and)\s*honou?rs?)$/i],
];
const TITLE_WORDS =
  /\b(engineer|developer|manager|analyst|designer|lead|director|intern|consultant|specialist|architect|scientist|associate|officer|coordinator|executive|administrator|president|head|assistant|marketer|programmer|technician|representative|strategist|researcher)\b/i;
const LOC_TAIL = /,?\s*((?:[A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)*),\s*[A-Z]{2}\b|Remote)\s*$/;
const DEG =
  /\b(bachelor|master|doctor|b\.?\s?sc?\.?|m\.?\s?sc?\.?|b\.?\s?tech|m\.?\s?tech|b\.?a\.?|m\.?a\.?|b\.?e\.?|mba|ph\.?d|associate|diploma)\b/i;
const SCH = /\b(university|college|institute|school|academy|polytechnic)\b/i;

export const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const stripBullet = (s: string) => s.replace(BULLET, "").trim();
const trimTrailing = (s: string) => s.replace(/[,\s]+$/, "");

function headingOf(line: string): SectionKey | null {
  const t = line.replace(/[:\s]+$/, "").replace(/^[#\s]+/, "").trim();
  if (!t || t.length > 40) return null;
  for (const [key, re] of SECTIONS) if (re.test(t)) return key;
  return null;
}
const splitParts = (s: string) => s.split(/\s*[|•·—–@]\s*|\s+-\s+|\s+at\s+/).map(clean).filter(Boolean);
function takeLocation(part: string): { rest: string; loc: string } {
  const m = LOC_TAIL.exec(part);
  return m ? { rest: clean(part.slice(0, m.index)), loc: m[1] ?? "" } : { rest: part, loc: "" };
}

interface RawEntry { head: string[]; bullets: string[] }
function groupEntries(lines: string[], isNewHeader?: (cur: RawEntry, line: string) => boolean): RawEntry[] {
  const entries: RawEntry[] = [];
  let cur: RawEntry | null = null;
  let inBullets = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (BULLET.test(line)) {
      if (!cur) { cur = { head: [], bullets: [] }; entries.push(cur); }
      cur.bullets.push(stripBullet(line));
      inBullets = true;
      continue;
    }
    if (inBullets && cur && /^[a-z]/.test(line) && !DATE_RANGE.test(line) && cur.bullets.length) {
      cur.bullets[cur.bullets.length - 1] += " " + line; // wrapped bullet line
      continue;
    }
    if (!cur || inBullets || (isNewHeader && isNewHeader(cur, line))) {
      cur = { head: [], bullets: [] };
      entries.push(cur);
      inBullets = false;
    }
    cur.head.push(line);
  }
  return entries;
}

export function parseResume(rawText: string): ParsedResume {
  const lines = rawText.replace(/\r/g, "").replace(/\u00a0/g, " ").split("\n");
  const R = emptyResume();

  const sec: Partial<Record<SectionKey | "header", string[]>> = { header: [] };
  let cur: SectionKey | "header" = "header";
  for (const l of lines) {
    const h = headingOf(l);
    if (h) { cur = h; sec[cur] ??= []; continue; }
    (sec[cur] ??= []).push(l);
  }

  // ---- contact
  const head = (sec.header ?? []).map((l) => l.trim()).filter(Boolean);
  const headText = head.join(" | ");
  R.email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(headText)?.[0] ?? "";
  const noEmail = headText.replace(R.email, " ");
  R.phone = clean(/(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.exec(noEmail)?.[0] ?? "");
  R.linkedin = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/i.exec(noEmail)?.[0] ?? "";
  R.github = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?/i.exec(noEmail)?.[0] ?? "";
  const urls = noEmail.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:dev|io|com|me|net|org|co)(?:\/[^\s|•·]*)?/gi) ?? [];
  R.website = urls.find((u) => !/linkedin|github/i.test(u)) ?? "";
  const segs = head.flatMap((l) => l.split(/\s*[|•·]\s*/)).map(clean).filter(Boolean);
  for (const s of segs) {
    const m = /^((?:[A-Z][A-Za-z.'-]+ ?)+,\s*[A-Z]{2})\b/.exec(s);
    if (m?.[1]) { R.location = m[1]; break; }
  }
  if (!R.location) R.location = segs.find((s) => /^remote$/i.test(s)) ?? "";

  const isContact = (s: string) => /@|\d{3}[\s.-]?\d{4}|linkedin|github|https?:/i.test(s);
  const nameIdx = head.findIndex((l) => {
    const n = l.split(/\s+/).length;
    return !isContact(l) && !/\d/.test(l) && n >= 2 && n <= 4 && /^[A-Z]/.test(l);
  });
  if (nameIdx >= 0) {
    const n = head[nameIdx] ?? "";
    R.name = n === n.toUpperCase() ? n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : n;
    const t = head[nameIdx + 1];
    if (t && !isContact(t) && t.length < 70 && !/,\s*[A-Z]{2}$/.test(t)) R.title = t;
  }

  R.summary = clean((sec.summary ?? []).join(" "));

  // ---- experience
  for (const e of groupEntries(sec.experience ?? [])) {
    let h = e.head.join(" | ");
    const exp: Experience = { title: "", company: "", location: "", start: "", end: "", bullets: e.bullets };
    const dm = DATE_RANGE.exec(h);
    if (dm) {
      const [a, b] = dm[0].split(/\s*(?:-|–|—|\bto\b)\s*/i);
      exp.start = clean(a ?? ""); exp.end = clean(b ?? "");
      h = h.replace(dm[0], " ");
    } else {
      const sm = SINGLE_DATE.exec(h);
      if (sm) { exp.start = exp.end = clean(sm[0]); h = h.replace(sm[0], " "); }
    }
    let parts = splitParts(h.replace(/\s*\|\s*/g, " | "))
      .filter((p) => !/^\|?$/.test(p))
      .map((p) => {
        const { rest, loc } = takeLocation(trimTrailing(p));
        if (loc && !exp.location) exp.location = loc;
        return rest;
      })
      .filter(Boolean);
    const only = parts[0];
    if (parts.length === 1 && only?.includes(",")) parts = only.split(/\s*,\s*/);
    for (const p of parts) {
      if (!exp.title && TITLE_WORDS.test(p)) exp.title = p;
      else if (!exp.company) exp.company = p;
      else if (!exp.title) exp.title = p;
    }
    if (exp.title || exp.company || exp.bullets.length) R.experience.push(exp);
  }

  // ---- education
  const newEdu = (c: RawEntry, l: string) => {
    const ch = c.head.join(" ");
    return (DEG.test(l) && DEG.test(ch)) || (SCH.test(l) && SCH.test(ch));
  };
  for (const e of groupEntries(sec.education ?? [], newEdu)) {
    let h = e.head.join(" | ");
    const ed: Education = { degree: "", school: "", location: "", year: "", gpa: "" };
    const g = /GPA[:\s]*([\d.]+(?:\s*\/\s*[\d.]+)?)/i.exec(h);
    if (g) { ed.gpa = clean(g[1] ?? ""); h = h.replace(g[0], " "); }
    const dm = DATE_RANGE.exec(h);
    if (dm) { ed.year = clean(dm[0]); h = h.replace(dm[0], " "); }
    else { const sm = /(?:19|20)\d{2}/.exec(h); if (sm) { ed.year = sm[0]; h = h.replace(sm[0], " "); } }
    let parts = splitParts(h)
      .map((p) => {
        const { rest, loc } = takeLocation(trimTrailing(p));
        if (loc && !ed.location) ed.location = loc;
        return trimTrailing(rest);
      })
      .filter(Boolean);
    const only = parts[0];
    if (parts.length === 1 && only?.includes(",")) parts = only.split(/\s*,\s*/);
    for (const p of parts) {
      if (!ed.degree && DEG.test(p) && !SCH.test(p)) ed.degree = p;
      else if (!ed.school && SCH.test(p)) ed.school = p;
      else if (!ed.degree) ed.degree = p;
      else if (!ed.school) ed.school = p;
    }
    if (ed.degree || ed.school) R.education.push(ed);
  }

  // ---- skills
  const seen = new Set<string>();
  for (const l of sec.skills ?? []) {
    let t = stripBullet(l.trim());
    if (!t) continue;
    const ci = t.indexOf(":");
    if (ci > -1 && ci < 30) t = t.slice(ci + 1);
    for (const s of t.split(/[,|;•·]/).map(clean)) {
      const k = s.toLowerCase();
      if (s && s.length <= 40 && !seen.has(k)) { seen.add(k); R.skills.push(s); }
    }
  }

  // ---- projects
  for (const e of groupEntries(sec.projects ?? [])) {
    const parts = e.head.join(" | ").split(/\s*[|—–]\s*|\s+-\s+/).map(clean).filter(Boolean);
    R.projects.push({ name: parts[0] ?? "", desc: parts.slice(1).join(" | "), bullets: e.bullets });
  }

  const listify = (ls: string[]) => ls.map((l) => stripBullet(l.trim())).filter(Boolean);
  R.certs = listify(sec.certs ?? []);
  R.awards = listify(sec.awards ?? []);
  return R;
}

export function resumeToText(R: ParsedResume): string {
  const L: string[] = [R.name];
  if (R.title) L.push(R.title);
  L.push([R.email, R.phone, R.location, R.linkedin, R.github, R.website].filter(Boolean).join(" | "), "");
  if (R.summary) L.push("SUMMARY", R.summary, "");
  if (R.experience.length) {
    L.push("EXPERIENCE");
    for (const e of R.experience) {
      const dates = [e.start, e.end].filter(Boolean).join(" – ");
      L.push([e.title, e.company, e.location].filter(Boolean).join(" | ") + (dates ? " | " + dates : ""));
      e.bullets.forEach((b) => L.push("- " + b));
      L.push("");
    }
  }
  if (R.education.length) {
    L.push("EDUCATION");
    for (const e of R.education) {
      L.push([e.degree, e.school, e.location, e.year].filter(Boolean).join(" | "));
      if (e.gpa) L.push("GPA: " + e.gpa);
    }
    L.push("");
  }
  if (R.skills.length) L.push("SKILLS", R.skills.join(", "), "");
  if (R.projects.length) {
    L.push("PROJECTS");
    for (const p of R.projects) { L.push([p.name, p.desc].filter(Boolean).join(" | ")); p.bullets.forEach((b) => L.push("- " + b)); }
    L.push("");
  }
  if (R.certs.length) { L.push("CERTIFICATIONS"); R.certs.forEach((c) => L.push("- " + c)); L.push(""); }
  if (R.awards.length) { L.push("AWARDS"); R.awards.forEach((c) => L.push("- " + c)); L.push(""); }
  return L.join("\n").trim() + "\n";
}
