import { describe, expect, it } from "vitest";
import { DEMO_RESUMES } from "./demo";
import { parseResume } from "./parser";
import { parsedToContent } from "./toContent";

describe("parsedToContent", () => {
  const c = parsedToContent(parseResume(DEMO_RESUMES.find((r) => r.id === "priya")!.text));

  it("fills basics, links, summary and skills", () => {
    expect(c.basics).toMatchObject({ fullName: "Priya Raman", email: "priya.raman@mailhub.example", location: "Seattle, WA" });
    expect(c.basics.links.map((l) => l.label)).toEqual(["LinkedIn", "GitHub", "Website"]);
    expect(c.summary.length).toBeGreaterThan(50);
    expect(c.skills).toContain("React");
  });

  it("maps jobs, marking the current one", () => {
    expect(c.experience).toHaveLength(3);
    expect(c.experience[0]).toMatchObject({ role: "Senior Software Engineer", company: "Northwind Payments", start: "Mar 2021", end: "", current: true });
    expect(c.experience[1]).toMatchObject({ end: "Feb 2021", current: false });
  });

  it("splits education years, project tech and certification years", () => {
    expect(c.education[0]).toMatchObject({ institution: "University of Washington", start: "2011", end: "2015", grade: "3.7/4.0" });
    expect(c.projects[0]).toMatchObject({ name: "OpenLedger", tech: ["TypeScript", "React", "Node.js"] });
    expect(c.certifications[0]).toMatchObject({ name: "AWS Certified Solutions Architect – Associate", year: "2022" });
  });
});
