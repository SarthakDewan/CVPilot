export type TemplateId = "classic" | "modern" | "compact";

export interface Link { label: string; url: string }
export interface Experience { company: string; role: string; location: string; start: string; end: string; current: boolean; bullets: string[] }
export interface Project { name: string; link: string; description: string; tech: string[]; bullets: string[] }
export interface Education { institution: string; degree: string; field: string; start: string; end: string; grade: string }
export interface Certification { name: string; issuer: string; year: string }

export interface ResumeContent {
  basics: { fullName: string; headline: string; email: string; phone: string; location: string; links: Link[] };
  summary: string;
  skills: string[];
  experience: Experience[];
  projects: Project[];
  education: Education[];
  achievements: string[];
  certifications: Certification[];
}

export interface AtsAnalysis {
  score: number;
  matched: string[];
  missing: string[];
  explanation: string;
  explanationSource: "gemini" | "template";
  cosine: number | null;
  model: string | null;
  truncatedResume: boolean;
  truncatedJob: boolean;
  analyzedAt: string | null;
}

export interface ResumeFull {
  id: string;
  title: string;
  templateId: TemplateId;
  content: ResumeContent;
  ats: AtsAnalysis | null;
  shared: boolean;
  shareExpiresAt: string | null;
  updatedAt: string;
}

export interface ResumeSummary {
  id: string;
  title: string;
  templateId: TemplateId;
  shared: boolean;
  atsScore: number | null;
  updatedAt: string;
}

export interface TemplateInfo { id: TemplateId; name: string; description: string; accent: string }

export const emptyContent = (): ResumeContent => ({
  basics: { fullName: "", headline: "", email: "", phone: "", location: "", links: [] },
  summary: "",
  skills: [],
  experience: [],
  projects: [],
  education: [],
  achievements: [],
  certifications: [],
});

/** Completeness is a UI hint only: the share of key sections that have content. */
export function completeness(c: ResumeContent): { pct: number; missing: string[] } {
  const checks: [string, boolean][] = [
    ["Name & contact", Boolean(c.basics.fullName && (c.basics.email || c.basics.phone))],
    ["Summary", c.summary.trim().length >= 40],
    ["Skills (5+)", c.skills.length >= 5],
    ["Experience", c.experience.length > 0],
    ["Education", c.education.length > 0],
    ["Projects", c.projects.length > 0],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return { pct: Math.round((100 * done) / checks.length), missing: checks.filter(([, ok]) => !ok).map(([n]) => n) };
}

export const range = (start: string, end: string, current?: boolean) =>
  [start, current ? "Present" : end].filter(Boolean).join(" – ");
