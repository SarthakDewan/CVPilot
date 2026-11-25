import { z } from "zod";

export const TEMPLATE_IDS = ["classic", "modern", "compact"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

const text = (max: number) => z.string().trim().max(max);
const bullets = z.array(text(400)).max(15).default([]);

export const resumeContentSchema = z.object({
  basics: z
    .object({
      fullName: text(120).default(""),
      headline: text(160).default(""),
      email: text(254).default(""),
      phone: text(40).default(""),
      location: text(120).default(""),
      links: z.array(z.object({ label: text(60), url: text(300) })).max(6).default([]),
    })
    .default({ fullName: "", headline: "", email: "", phone: "", location: "", links: [] }),
  summary: text(1500).default(""),
  skills: z.array(text(60).min(1)).max(80).default([]),
  experience: z
    .array(
      z.object({
        company: text(120),
        role: text(120),
        location: text(120).default(""),
        start: text(20).default(""),
        end: text(20).default(""),
        current: z.boolean().default(false),
        bullets,
      }),
    )
    .max(15)
    .default([]),
  projects: z
    .array(
      z.object({
        name: text(120),
        link: text(300).default(""),
        description: text(600).default(""),
        tech: z.array(text(40)).max(20).default([]),
        bullets,
      }),
    )
    .max(15)
    .default([]),
  education: z
    .array(
      z.object({
        institution: text(160),
        degree: text(120).default(""),
        field: text(120).default(""),
        start: text(20).default(""),
        end: text(20).default(""),
        grade: text(40).default(""),
      }),
    )
    .max(10)
    .default([]),
  achievements: z.array(text(400)).max(20).default([]),
  certifications: z
    .array(z.object({ name: text(160), issuer: text(120).default(""), year: text(10).default("") }))
    .max(20)
    .default([]),
});

export type ResumeContent = z.infer<typeof resumeContentSchema>;

export const createResumeSchema = z.object({
  title: text(120).min(1),
  templateId: z.enum(TEMPLATE_IDS).default("classic"),
  content: resumeContentSchema.default(() => resumeContentSchema.parse({})),
});

export const updateResumeSchema = z
  .object({
    title: text(120).min(1),
    templateId: z.enum(TEMPLATE_IDS),
    content: resumeContentSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

export const shareSchema = z.object({
  /** Optional link lifetime; omitted means the link never expires until revoked. */
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export const analyzeSchema = z.object({
  jobDescription: z.string().trim().min(50, "Paste the full job description (at least 50 characters)").max(20000),
});

export const mlScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  cosine: z.number(),
  matched: z.array(z.string()),
  missing: z.array(z.string()),
  explanation: z.string(),
  explanation_source: z.enum(["gemini", "template"]),
  model: z.string(),
  truncated_resume: z.boolean(),
  truncated_job: z.boolean(),
});

export const suggestSchema = z.object({
  kind: z.enum(["bullet", "summary"]),
  text: z.string().trim().min(10).max(1200),
});

/** Plain-text view of a resume, used later by the ATS analyzer and for exports. */
export function resumeToText(c: ResumeContent): string {
  const lines: string[] = [];
  const b = c.basics;
  lines.push(b.fullName, b.headline);
  if (c.summary) lines.push(c.summary);
  if (c.skills.length) lines.push("Skills: " + c.skills.join(", "));
  for (const e of c.experience) lines.push(`${e.role} at ${e.company}`, ...e.bullets);
  for (const p of c.projects) lines.push(p.name, p.description, p.tech.join(", "), ...p.bullets);
  for (const e of c.education) lines.push(`${e.degree} ${e.field} ${e.institution}`);
  lines.push(...c.achievements);
  for (const cert of c.certifications) lines.push(`${cert.name} ${cert.issuer}`);
  return lines.filter(Boolean).join("\n");
}
