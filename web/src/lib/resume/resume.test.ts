import { describe, expect, it } from "vitest";
import { scoreResume } from "./ats";
import { DEMO_JDS, DEMO_RESUMES } from "./demo";
import { parseResume, resumeToText } from "./parser";

const demo = (id: string) => {
  const d = DEMO_RESUMES.find((r) => r.id === id)!;
  const jd = DEMO_JDS.find((j) => j.id === d.jdId)!;
  return { R: parseResume(d.text), jd: jd.text };
};

describe("parseResume", () => {
  it("extracts contact, jobs, education, skills and certs from a rich resume", () => {
    const { R } = demo("priya");
    expect(R).toMatchObject({ name: "Priya Raman", title: "Senior Software Engineer", location: "Seattle, WA", phone: "(206) 555-0148" });
    expect(R.email).toBe("priya.raman@mailhub.example");
    expect(R.experience).toHaveLength(3);
    expect(R.experience[0]).toMatchObject({ title: "Senior Software Engineer", company: "Northwind Payments", start: "Mar 2021", end: "Present" });
    expect(R.experience[0]?.bullets).toHaveLength(5);
    expect(R.education[0]).toMatchObject({ school: "University of Washington", gpa: "3.7/4.0" });
    expect(R.skills).toContain("TypeScript");
    expect(R.certs).toHaveLength(2);
  });

  it("handles the dash-separated and comma-separated layouts", () => {
    expect(demo("marcus").R.experience[1]).toMatchObject({ company: "Pecos Logistics", location: "Dallas, TX", start: "Jun 2019" });
    expect(demo("jordan").R.experience[0]).toMatchObject({ title: "Marketing Assistant", company: "Windy City Home Goods", location: "Chicago, IL" });
  });

  it("reports missing fields as empty strings", () => {
    const { R } = demo("jordan");
    expect(R.phone).toBe("");
    expect(R.linkedin).toBe("");
  });

  it("round-trips through the plain-text view", () => {
    const { R } = demo("priya");
    const again = parseResume(resumeToText(R));
    expect(again.experience).toHaveLength(R.experience.length);
    expect(again.skills.length).toBe(R.skills.length);
  });
});

describe("scoreResume", () => {
  it("scores the demo resumes as strong, strong and weak", () => {
    const [p, m, j] = ["priya", "marcus", "jordan"].map((id) => { const { R, jd } = demo(id); return scoreResume(R, jd).total; });
    expect(p).toBeGreaterThanOrEqual(90);
    expect(m).toBeGreaterThanOrEqual(90);
    expect(j).toBeLessThan(50);
  });

  it("improves when the weak resume is fixed", () => {
    const { R, jd } = demo("jordan");
    const before = scoreResume(R, jd).total;
    R.phone = "312-555-0110"; R.linkedin = "linkedin.com/in/jordanellis";
    R.experience[0]!.bullets = ["Grew Instagram following by 42% in 6 months", "Launched 3 email newsletters with a 31% open rate using Mailchimp"];
    expect(scoreResume(R, jd).total).toBeGreaterThan(before + 15);
  });

  it("lists missing keywords from the job description", () => {
    const { R, jd } = demo("jordan");
    expect(scoreResume(R, jd).miss).toContain("seo");
  });
});
