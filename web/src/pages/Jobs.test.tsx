import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../lib/toast";
import JobMatches, { formatSalary } from "./JobMatches";
import ScamRadar from "./ScamRadar";

const screening = (band: string, fired: string[]) => ({
  rho: fired.length / 4, p_clf: null, risk: fired.length / 4, band, mode: "rule-only",
  fired: fired.map((id) => ({ id, name: `Rule ${id}`, reason: `Reason ${id}`, evidence: `evidence-${id}` })),
  checked: ["h1", "h2", "h3", "h4"].map((id) => ({ id, name: `Rule ${id}`, fired: fired.includes(id) })),
});
const job = (id: string, band: string, fired: string[]) => ({
  id, title: `Job ${id}`, company: "Acme", location: "Pune", description: "Build things", url: "https://x.test/" + id,
  salary: { min: 500000, max: 800000, currency: "INR", predicted: true }, score: 70, cosine: 0.7, matchedTerms: ["Python"], scam: screening(band, fired),
});

function stub(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const r = handler(url, init);
    const status = r.status ?? 200;
    return { ok: status < 400, status, statusText: "", json: async () => r.body };
  }));
}
const wrap = (ui: React.ReactNode) => render(<MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter>);
afterEach(() => vi.unstubAllGlobals());

describe("JobMatches", () => {
  it("shows ranked jobs, labels high risk without hiding it, and explains the rating", async () => {
    stub((url) => url.endsWith("/resumes") ? { body: { resumes: [{ id: "r1", title: "CV" }] } } : { body: { mode: "rule-only", fetched: 30, results: [job("1", "safe", []), job("2", "high", ["h1", "h3"])] } });
    wrap(<JobMatches />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Role"), "Developer");
    await user.click(screen.getByRole("button", { name: "Find jobs" }));
    const results = await screen.findByRole("region", { name: "Results" });
    expect(within(results).getByText("Job 1")).toBeInTheDocument();
    expect(within(results).getByText("Job 2")).toBeInTheDocument();
    expect(within(results).getByText("High risk")).toBeInTheDocument();
    expect(within(results).getByText("Low risk")).toBeInTheDocument();
    expect(within(results).getByRole("note")).toHaveTextContent(/High scam risk/);
    expect(within(results).getByText(/Rule-only mode/)).toBeInTheDocument();
    expect(within(results).getByText(/evidence-h1/)).toBeInTheDocument();
    expect(within(results).getByText(/top 2 of 30/)).toBeInTheDocument();
  });

  it("shows the server's message when Adzuna is not configured", async () => {
    stub((url) => url.endsWith("/resumes") ? { body: { resumes: [] } } : { status: 503, body: { error: { code: "feature_unavailable", message: "Job search is unavailable: Adzuna is not configured" } } });
    wrap(<JobMatches />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Role"), "Developer");
    await user.click(screen.getByRole("button", { name: "Find jobs" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Adzuna is not configured");
  });

  it("formats salaries", () => {
    expect(formatSalary({ min: null, max: null, currency: "INR", predicted: false })).toBeNull();
    expect(formatSalary({ min: 500000, max: 800000, currency: "INR", predicted: true })).toMatch(/estimated/);
    expect(formatSalary({ min: 1000, max: 1000, currency: "USD", predicted: false })).toBe("$1,000");
  });
});

describe("ScamRadar", () => {
  it("checks pasted text and shows fired indicators with their evidence", async () => {
    stub(() => ({ body: { screening: screening("high", ["h1", "h4"]) } }));
    wrap(<ScamRadar />);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Check listing" });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Listing text"), "Pay a registration fee and email hr@gmail.com");
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    const res = await screen.findByRole("region", { name: "Scam check result" });
    expect(within(res).getByText("2 indicators found")).toBeInTheDocument();
    expect(within(res).getByText("Reason h1")).toBeInTheDocument();
    expect(within(res).getByText("evidence-h4")).toBeInTheDocument();
    expect(within(res).getByRole("meter")).toHaveAttribute("aria-valuenow", "50");
  });
});
