import { describe, expect, it } from "vitest";
import { timeAgo } from "./time";
import { completeness, emptyContent, range } from "./types";

describe("completeness", () => {
  it("is 0% for an empty resume and lists what is missing", () => {
    const r = completeness(emptyContent());
    expect(r.pct).toBe(0);
    expect(r.missing).toContain("Experience");
  });

  it("counts filled sections", () => {
    const c = emptyContent();
    c.basics.fullName = "Ada";
    c.basics.email = "a@b.co";
    c.skills = ["a", "b", "c", "d", "e"];
    c.education = [{ institution: "U", degree: "", field: "", start: "", end: "", grade: "" }];
    expect(completeness(c).pct).toBe(50);
  });
});

describe("formatting helpers", () => {
  it("builds date ranges", () => {
    expect(range("2020", "2022")).toBe("2020 – 2022");
    expect(range("2020", "", true)).toBe("2020 – Present");
    expect(range("", "")).toBe("");
  });

  it("formats relative times", () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 5_000).toISOString(), now)).toBe("just now");
    expect(timeAgo(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5 min ago");
    expect(timeAgo(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe("3 h ago");
    expect(timeAgo(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe("2 d ago");
  });
});
