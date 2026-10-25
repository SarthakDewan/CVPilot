import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { emptyContent } from "../lib/types";
import { ResumePreview } from "./ResumePreview";

describe("ResumePreview", () => {
  it("renders only sections that have content", () => {
    const c = emptyContent();
    c.basics.fullName = "Ada Lovelace";
    c.skills = ["TypeScript", "SQL"];
    render(<ResumePreview content={c} templateId="modern" />);
    expect(screen.getByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByText("TypeScript, SQL")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Experience" })).not.toBeInTheDocument();
  });

  it("renders experience with a Present end date for current roles", () => {
    const c = emptyContent();
    c.experience = [{ company: "Acme", role: "Engineer", location: "", start: "2021", end: "", current: true, bullets: ["Shipped X"] }];
    render(<ResumePreview content={c} templateId="classic" />);
    expect(screen.getByText("Engineer, Acme")).toBeInTheDocument();
    expect(screen.getByText("2021 – Present")).toBeInTheDocument();
    expect(screen.getByText("Shipped X")).toBeInTheDocument();
  });
});
