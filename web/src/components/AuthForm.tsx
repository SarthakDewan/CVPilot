import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await (isRegister ? register : login)(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? "/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        setError(err.details.map((d) => d.message).join(". "));
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <h1 className="text-3xl font-bold">CVPilot</h1>
      <p className="mt-1 text-slate-600">{isRegister ? "Create your account" : "Sign in to your account"}</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-lg bg-white p-6 shadow" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input
            id="email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:outline-2 focus:outline-blue-600"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">Password</label>
          <input
            id="password" type="password" required value={password}
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 10 : undefined}
            aria-describedby={isRegister ? "pw-hint" : undefined}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:outline-2 focus:outline-blue-600"
          />
          {isRegister && <p id="pw-hint" className="mt-1 text-xs text-slate-500">At least 10 characters.</p>}
        </div>

        {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit" disabled={busy}
          className="w-full rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>

        {isRegister && (
          <p className="text-xs text-slate-500">
            Privacy notice: when you use the ATS analyzer, resume phrasing suggestions, roadmap guidance or job
            explanations, limited text derived from your resume is sent to a third-party LLM provider (Google Gemini).
          </p>
        )}
      </form>

      <p className="mt-4 text-center text-sm">
        {isRegister ? (
          <>Already have an account? <Link className="text-blue-700 underline" to="/login">Sign in</Link></>
        ) : (
          <>New here? <Link className="text-blue-700 underline" to="/register">Create an account</Link></>
        )}
      </p>
    </main>
  );
}
