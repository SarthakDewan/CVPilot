import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../lib/toast";
import MarketInsights from "./MarketInsights";
import Settings from "./Settings";
import SkillRoadmap, { progressOf } from "./SkillRoadmap";

type Call = { method: string; url: string; body?: unknown };
function stub(handler: (c: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const c = { method: init?.method ?? "GET", url: url.replace("/api/v1", ""), body: init?.body ? JSON.parse(init.body as string) : undefined };
    calls.push(c);
    const r = c.url === "/auth/me" ? (handler(c).body && (handler(c).body as { user?: unknown }).user ? handler(c) : { body: me }) : handler(c);
    const status = r.status ?? 200;
    return { ok: status < 400, status, statusText: "", json: async () => r.body };
  }));
  return calls;
}
const wrap = (ui: React.ReactNode) => render(<MemoryRouter><ToastProvider><AuthProvider>{ui}</AuthProvider></ToastProvider></MemoryRouter>);
const me = { user: { id: "1", email: "me@example.com" } };
afterEach(() => vi.unstubAllGlobals());

const insight = {
  role: "data analyst", location: "pune", listingCount: 20, updatedAt: new Date().toISOString(), salaryPredictedShare: 0.5,
  skills: [{ skill: "SQL", count: 12, demand: 0.6 }, { skill: "Python", count: 8, demand: 0.4 }],
  salary: { count: 10, min: 300000, max: 900000, mean: 600000, median: 550000, p25: 400000, p75: 700000, currency: "INR" },
};

describe("MarketInsights", () => {
  it("shows demand with counts, salary stats and the estimate caveat", async () => {
    stub((c) => c.url === "/profile" ? { body: { profile: { preferredRoles: ["Data Analyst"], location: "Pune" } } } : { body: { insight } });
    wrap(<MarketInsights />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText("Role")).toHaveValue("Data Analyst"));
    await user.click(screen.getByRole("button", { name: "Get insights" }));
    const region = await screen.findByRole("region", { name: "Insights" });
    expect(within(region).getByText("20", { selector: "strong" })).toBeInTheDocument();
    expect(within(region).getByText("12/20 · 60%")).toBeInTheDocument();
    expect(within(region).getByText("8/20 · 40%")).toBeInTheDocument();
    expect(within(region).getByText(/₹5,50,000|₹550,000/)).toBeInTheDocument();
    expect(within(region).getByText(/50%/, { selector: "strong" })).toBeInTheDocument(); // estimated share
  });

  it("shows server errors such as no listings", async () => {
    stub((c) => c.url === "/profile" ? { body: { profile: {} } } : { status: 404, body: { error: { code: "no_listings", message: "No listings were found for that role" } } });
    wrap(<MarketInsights />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Role"), "Basket Weaver");
    await user.click(screen.getByRole("button", { name: "Get insights" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No listings were found");
  });
});

describe("SkillRoadmap", () => {
  const roadmap = (statuses: string[]) => {
    const items = [
      { skill: "SQL", count: 12, demand: 0.6, guidance: "Learn joins.", guidanceSource: "template", status: statuses[0] },
      { skill: "Docker", count: 6, demand: 0.3, guidance: "Containerise an app.", guidanceSource: "gemini", status: statuses[1] },
    ];
    const completed = items.filter((i) => i.status === "completed").length;
    return { role: "backend", location: "", tau: 0.1, listingCount: 20, generatedAt: "", items, covered: [{ skill: "Python", count: 15, demand: 0.75 }],
      progress: { completed, inProgress: 0, total: 2, percent: (100 * completed) / 2 } };
  };

  it("shows evidence per item and updates progress when a milestone is completed", async () => {
    let state = roadmap(["not_started", "not_started"]);
    const calls = stub((c) => {
      if (c.url === "/roadmap" && c.method === "GET") return { body: { roadmap: state } };
      if (c.url === "/roadmap/items") { state = roadmap(["completed", "not_started"]); return { body: { roadmap: state } }; }
      if (c.url === "/resumes") return { body: { resumes: [] } };
      return { body: { profile: {} } };
    });
    wrap(<SkillRoadmap />);
    const user = userEvent.setup();
    const region = await screen.findByRole("region", { name: "Roadmap" });
    expect(within(region).getByText(/12/, { selector: "strong" })).toBeInTheDocument();
    expect(within(region).getByText("Tip written by Gemini")).toBeInTheDocument();
    expect(within(region).getByText("Standard tip (no LLM)")).toBeInTheDocument();
    expect(within(region).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");

    const group = within(region).getByRole("radiogroup", { name: "Status of SQL" });
    await user.click(within(group).getByRole("radio", { name: "Completed" }));
    await waitFor(() => expect(within(region).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50"));
    expect(calls.find((c) => c.url === "/roadmap/items")?.body).toEqual({ skill: "SQL", status: "completed" });
    expect(within(region).getByText("Python · 75%")).toBeInTheDocument();
  });

  it("reverts the optimistic update when saving fails", async () => {
    stub((c) => {
      if (c.url === "/roadmap" && c.method === "GET") return { body: { roadmap: roadmap(["not_started", "not_started"]) } };
      if (c.url === "/roadmap/items") return { status: 500, body: { error: { code: "internal_error", message: "x" } } };
      return { body: c.url === "/resumes" ? { resumes: [] } : { profile: {} } };
    });
    wrap(<SkillRoadmap />);
    const user = userEvent.setup();
    const region = await screen.findByRole("region", { name: "Roadmap" });
    await user.click(within(within(region).getByRole("radiogroup", { name: "Status of SQL" })).getByRole("radio", { name: "Completed" }));
    expect(await screen.findByText("Could not save that change")).toBeInTheDocument();
    expect(within(region).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("progress = 100 * completed / total", () => {
    expect(progressOf([])).toEqual({ total: 0, completed: 0, percent: 0 });
    expect(progressOf([{ status: "completed" }, { status: "completed" }, { status: "in_progress" }]).percent).toBe(66.7);
  });
});

describe("Settings", () => {
  it("saves the profile", async () => {
    const calls = stub((c) => {
      if (c.url === "/auth/me") return { body: me };
      if (c.url === "/profile" && c.method === "PUT") return { body: { profile: c.body } };
      return { body: { profile: { fullName: "Ada", skills: ["Python"] } } };
    });
    wrap(<Settings />);
    const user = userEvent.setup();
    const name = await screen.findByLabelText("Full name");
    await user.clear(name);
    await user.type(name, "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Profile saved")).toBeInTheDocument();
    const put = calls.find((c) => c.method === "PUT")!.body as { fullName: string; skills: string[] };
    expect(put.fullName).toBe("Ada Lovelace");
    expect(put.skills).toEqual(["Python"]);
  });

  it("requires a password to delete the account and sends it", async () => {
    const calls = stub((c) => {
      if (c.url === "/auth/me") return { body: me };
      if (c.url === "/account/delete") return { body: { deleted: { account: true } } };
      return { body: { profile: {} } };
    });
    wrap(<Settings />);
    const user = userEvent.setup();
    expect(await screen.findByRole("link", { name: /Export my data/ })).toHaveAttribute("href", "/api/v1/account/export");
    await user.click(screen.getByRole("button", { name: /Delete my account/ }));
    const confirm = screen.getByRole("button", { name: "Permanently delete" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("Confirm with your password"), "my-password");
    await user.click(confirm);
    await waitFor(() => expect(calls.find((c) => c.url === "/account/delete")?.body).toEqual({ password: "my-password" }));
  });

  it("states what is sent to the LLM provider", async () => {
    stub((c) => ({ body: c.url === "/auth/me" ? me : { profile: {} } }));
    wrap(<Settings />);
    expect(await screen.findByText(/third-party LLM provider/)).toBeInTheDocument();
  });
});
