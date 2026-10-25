import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./lib/auth";

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const r = handler(url, init);
      return { ok: r.status < 400, status: r.status, statusText: "", json: async () => r.body };
    }),
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("auth UI", () => {
  it("redirects unauthenticated users to the login page", async () => {
    mockFetch(() => ({ status: 401, body: { error: { code: "unauthorized", message: "Authentication required" } } }));
    renderAt("/");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the server error on a failed login", async () => {
    mockFetch((url) =>
      url.endsWith("/auth/me") || url.endsWith("/auth/login")
        ? { status: 401, body: { error: { code: "unauthorized", message: "Invalid email or password" } } }
        : { status: 404 },
    );
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "whatever-pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });

  it("registers and lands on the dashboard", async () => {
    mockFetch((url) => {
      if (url.endsWith("/auth/me")) return { status: 401, body: { error: { code: "unauthorized", message: "x" } } };
      if (url.endsWith("/auth/register")) return { status: 201, body: { user: { id: "1", email: "a@b.co" } } };
      return { status: 404 };
    });
    renderAt("/register");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "a-long-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument());
    expect(screen.getByText("a@b.co")).toBeInTheDocument();
  });
});
