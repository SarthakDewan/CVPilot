import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../lib/toast";
import AtsPage from "./AtsPage";

const analysis = {
  score: 64, matched: ["Python", "SQL"], missing: ["Kubernetes"], explanation: "Decent overlap.",
  explanationSource: "template", cosine: 0.64, model: "all-MiniLM-L6-v2", truncatedResume: true, truncatedJob: false, analyzedAt: null,
};

function stub(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = handler(url, init);
    return { ok: true, status: 200, statusText: "", json: async () => body };
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe("AtsPage", () => {
  it("analyzes and shows the evidence, disclaimer and truncation warning", async () => {
    const calls: string[] = [];
    stub((url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/resumes")) return { resumes: [{ id: "r1", title: "My CV", templateId: "modern", shared: false, atsScore: null, updatedAt: "" }] };
      if (url.endsWith("/resumes/r1")) return { resume: { id: "r1", ats: null } };
      if (url.endsWith("/analyze")) return { analysis };
      return {};
    });
    render(<MemoryRouter><ToastProvider><AtsPage /></ToastProvider></MemoryRouter>);
    const user = userEvent.setup();
    const button = await screen.findByRole("button", { name: "Analyze match" });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Job description"), "x".repeat(60));
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(await screen.findByRole("img", { name: /Match score 64 out of 100/ })).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("Kubernetes")).toBeInTheDocument();
    expect(screen.getByText(/not a probability/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/first ~256 tokens/);
    expect(screen.getByText("Template (no LLM)")).toBeInTheDocument();
    expect(calls).toContain("POST /api/v1/resumes/r1/analyze");
  });

  it("shows a prompt to create a resume when there are none", async () => {
    stub(() => ({ resumes: [] }));
    render(<MemoryRouter><ToastProvider><AtsPage /></ToastProvider></MemoryRouter>);
    expect(await screen.findByText("You need a resume first.")).toBeInTheDocument();
  });
});
