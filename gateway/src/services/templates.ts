import type { TemplateId } from "./resumeSchema.js";

export interface TemplateStyle {
  id: TemplateId;
  name: string;
  description: string;
  /** Hex without '#', used by exports. */
  accent: string;
  pdfFont: { regular: string; bold: string; italic: string };
  docxFont: string;
  baseSize: number;
  headingSize: number;
  nameSize: number;
  centerHeader: boolean;
  uppercaseHeadings: boolean;
  headingRule: boolean;
}

export const TEMPLATES: Record<TemplateId, TemplateStyle> = {
  classic: {
    id: "classic",
    name: "Classic",
    description: "Traditional serif layout with ruled section headings. Safe for any industry.",
    accent: "111111",
    pdfFont: { regular: "Times-Roman", bold: "Times-Bold", italic: "Times-Italic" },
    docxFont: "Times New Roman",
    baseSize: 10.5,
    headingSize: 11.5,
    nameSize: 22,
    centerHeader: true,
    uppercaseHeadings: true,
    headingRule: true,
  },
  modern: {
    id: "modern",
    name: "Modern",
    description: "Clean sans-serif with a blue accent and left-aligned header.",
    accent: "1D4ED8",
    pdfFont: { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" },
    docxFont: "Calibri",
    baseSize: 10,
    headingSize: 11.5,
    nameSize: 24,
    centerHeader: false,
    uppercaseHeadings: false,
    headingRule: true,
  },
  compact: {
    id: "compact",
    name: "Compact",
    description: "Dense one-page layout with smaller type, for long histories.",
    accent: "0F766E",
    pdfFont: { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" },
    docxFont: "Arial",
    baseSize: 9,
    headingSize: 10,
    nameSize: 18,
    centerHeader: false,
    uppercaseHeadings: true,
    headingRule: false,
  },
};

export function dateRange(start: string, end: string, current = false): string {
  const right = current ? "Present" : end;
  return [start, right].filter(Boolean).join(" – ");
}
