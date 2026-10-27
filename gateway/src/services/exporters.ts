import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import PDFDocument from "pdfkit";
import type { ResumeContent } from "./resumeSchema.js";
import { dateRange, TEMPLATES, type TemplateStyle } from "./templates.js";
import type { TemplateId } from "./resumeSchema.js";

/** Template-neutral layout model shared by the PDF and DOCX writers. */
interface Item {
  heading?: string;
  right?: string;
  sub?: string;
  text?: string;
  bullets?: string[];
}
interface Section {
  title: string;
  items: Item[];
}
interface Layout {
  name: string;
  headline: string;
  contact: string;
  sections: Section[];
}

export function buildLayout(c: ResumeContent): Layout {
  const b = c.basics;
  const contact = [b.email, b.phone, b.location, ...b.links.map((l) => l.url || l.label)]
    .filter(Boolean)
    .join("  |  ");
  const sections: Section[] = [];
  const add = (title: string, items: Item[]) => items.length && sections.push({ title, items });

  add("Summary", c.summary ? [{ text: c.summary }] : []);
  add("Skills", c.skills.length ? [{ text: c.skills.join(", ") }] : []);
  add(
    "Experience",
    c.experience.map((e) => ({
      heading: [e.role, e.company].filter(Boolean).join(", "),
      right: dateRange(e.start, e.end, e.current),
      sub: e.location,
      bullets: e.bullets.filter(Boolean),
    })),
  );
  add(
    "Projects",
    c.projects.map((p) => ({
      heading: p.name,
      right: p.link,
      sub: p.tech.length ? p.tech.join(", ") : undefined,
      text: p.description,
      bullets: p.bullets.filter(Boolean),
    })),
  );
  add(
    "Education",
    c.education.map((e) => ({
      heading: [e.degree, e.field].filter(Boolean).join(", ") || e.institution,
      right: dateRange(e.start, e.end),
      sub: [e.degree || e.field ? e.institution : "", e.grade].filter(Boolean).join("  |  "),
    })),
  );
  add("Achievements", c.achievements.length ? [{ bullets: c.achievements.filter(Boolean) }] : []);
  add(
    "Certifications",
    c.certifications.map((x) => ({ heading: x.name, right: x.year, sub: x.issuer })),
  );
  return { name: b.fullName || "Your Name", headline: b.headline, contact, sections };
}

export function exportFileName(title: string, ext: string): string {
  const base = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "resume";
  return `${base}.${ext}`;
}

// ---------------------------------------------------------------- PDF

export function renderPdf(c: ResumeContent, templateId: TemplateId, opts: { compress?: boolean } = {}): Promise<Buffer> {
  const t = TEMPLATES[templateId];
  const layout = buildLayout(c);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 40, left: 46, right: 46 }, compress: opts.compress ?? true });
    const chunks: Buffer[] = [];
    doc.on("data", (d: Buffer) => chunks.push(d));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    writePdf(doc, layout, t);
    doc.end();
  });
}

function writePdf(doc: PDFKit.PDFDocument, layout: Layout, t: TemplateStyle) {
  const accent = `#${t.accent}`;
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const align = t.centerHeader ? "center" : "left";

  doc.font(t.pdfFont.bold).fontSize(t.nameSize).fillColor(accent).text(layout.name, { align });
  if (layout.headline) doc.font(t.pdfFont.regular).fontSize(t.baseSize + 1).fillColor("#333").text(layout.headline, { align });
  if (layout.contact) doc.font(t.pdfFont.regular).fontSize(t.baseSize - 0.5).fillColor("#555").text(layout.contact, { align });
  doc.moveDown(0.6);

  for (const section of layout.sections) {
    if (doc.y > doc.page.height - 120) doc.addPage();
    const title = t.uppercaseHeadings ? section.title.toUpperCase() : section.title;
    doc.font(t.pdfFont.bold).fontSize(t.headingSize).fillColor(accent).text(title, left, doc.y); // explicit x: bullets above leave doc.x indented
    if (t.headingRule) {
      const y = doc.y + 1;
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.6).strokeColor(accent).stroke();
      doc.moveDown(0.3);
    }
    for (const item of section.items) {
      if (item.heading) {
        const y = doc.y;
        doc.font(t.pdfFont.bold).fontSize(t.baseSize).fillColor("#111").text(item.heading, left, y, { width: width * 0.72, continued: false });
        const afterHeading = doc.y;
        if (item.right) {
          doc.font(t.pdfFont.regular).fontSize(t.baseSize - 0.5).fillColor("#555").text(item.right, left, y, { width, align: "right" });
        }
        doc.y = Math.max(afterHeading, doc.y);
      }
      if (item.sub) doc.font(t.pdfFont.italic).fontSize(t.baseSize - 0.5).fillColor("#555").text(item.sub, left, doc.y, { width });
      if (item.text) doc.font(t.pdfFont.regular).fontSize(t.baseSize).fillColor("#222").text(item.text, left, doc.y, { width });
      for (const bullet of item.bullets ?? []) {
        doc.font(t.pdfFont.regular).fontSize(t.baseSize).fillColor("#222").text(`•  ${bullet}`, left + 8, doc.y, { width: width - 8 });
      }
      doc.moveDown(0.35);
    }
    doc.moveDown(0.2);
  }
}

// --------------------------------------------------------------- DOCX

export async function renderDocx(c: ResumeContent, templateId: TemplateId): Promise<Buffer> {
  const t = TEMPLATES[templateId];
  const layout = buildLayout(c);
  const font = t.docxFont;
  const size = (pt: number) => Math.round(pt * 2); // docx sizes are half-points
  const alignment = t.centerHeader ? AlignmentType.CENTER : AlignmentType.LEFT;
  const rightTab = 10000;
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment,
      children: [new TextRun({ text: layout.name, bold: true, font, size: size(t.nameSize), color: t.accent })],
    }),
  );
  if (layout.headline) {
    children.push(new Paragraph({ alignment, children: [new TextRun({ text: layout.headline, font, size: size(t.baseSize + 1) })] }));
  }
  if (layout.contact) {
    children.push(
      new Paragraph({
        alignment,
        spacing: { after: 120 },
        children: [new TextRun({ text: layout.contact, font, size: size(t.baseSize - 0.5), color: "555555" })],
      }),
    );
  }

  for (const section of layout.sections) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 60 },
        border: t.headingRule ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: t.accent, space: 1 } } : undefined,
        children: [
          new TextRun({
            text: t.uppercaseHeadings ? section.title.toUpperCase() : section.title,
            bold: true,
            font,
            size: size(t.headingSize),
            color: t.accent,
          }),
        ],
      }),
    );
    for (const item of section.items) {
      if (item.heading) {
        children.push(
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: rightTab }],
            children: [
              new TextRun({ text: item.heading, bold: true, font, size: size(t.baseSize) }),
              ...(item.right ? [new TextRun({ text: `\t${item.right}`, font, size: size(t.baseSize - 0.5), color: "555555" })] : []),
            ],
          }),
        );
      }
      if (item.sub) children.push(new Paragraph({ children: [new TextRun({ text: item.sub, italics: true, font, size: size(t.baseSize - 0.5), color: "555555" })] }));
      if (item.text) children.push(new Paragraph({ children: [new TextRun({ text: item.text, font, size: size(t.baseSize) })] }));
      for (const bullet of item.bullets ?? []) {
        children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: bullet, font, size: size(t.baseSize) })] }));
      }
    }
  }

  const doc = new Document({
    creator: "CVPilot",
    title: `${layout.name} – Resume`,
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 860, right: 860 } } }, children }],
  });
  return Packer.toBuffer(doc);
}
