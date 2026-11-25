import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo, CheckIcon } from "../components/icons";
import { Button, Field } from "../components/ui";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

const POINTS = ["Build ATS-friendly resumes with live preview", "See exactly which keywords you match and miss", "Spot risky job postings before you apply", "Turn market demand into a learning roadmap"];

export function AuthPage({ mode }: { mode: "login" | "register" }) {
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
      navigate((location.state as { from?: string } | null)?.from ?? "/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.details?.length ? err.details.map((d) => d.message).join(". ") : err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="animate-float absolute -left-20 -top-20 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" aria-hidden="true" />
        <div className="animate-float absolute -bottom-24 right-0 h-96 w-96 rounded-full bg-violet-500/30 blur-3xl [animation-delay:-4s]" aria-hidden="true" />
        <Logo className="relative text-2xl" />
        <div className="relative">
          <h2 className="text-4xl font-extrabold leading-tight">Land the right job,<br />with evidence behind every score.</h2>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p, i) => (
              <li key={p} className="animate-fade-up flex items-center gap-3 text-brand-100" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15"><CheckIcon className="h-4 w-4" /></span>{p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-100/70">Built for students, graduates and professionals.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10">
        <div className="animate-fade-up w-full max-w-sm">
          <Logo className="mb-8 text-xl text-brand-900 lg:hidden" />
          <h1 className="text-2xl font-extrabold">{isRegister ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1 text-sm text-slate-600">{isRegister ? "Start building a stronger application." : "Sign in to continue."}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field
              label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"} minLength={isRegister ? 10 : undefined}
              hint={isRegister ? "At least 10 characters." : undefined}
            />
            {error && <p role="alert" className="animate-fade-up rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full !py-2.5">{busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}</Button>
            {isRegister && (
              <p className="text-xs text-slate-500">
                Privacy notice: features such as ATS explanations, wording suggestions and roadmap guidance send limited text derived from your resume to a third-party LLM provider (Google Gemini).
              </p>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            {isRegister ? <>Already have an account? <Link className="font-semibold text-brand-700 hover:underline" to="/login">Sign in</Link></>
              : <>New here? <Link className="font-semibold text-brand-700 hover:underline" to="/register">Create an account</Link></>}
          </p>
        </div>
      </main>
    </div>
  );
}
