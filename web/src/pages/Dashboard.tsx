import { useAuth } from "../lib/auth";

// Phase 1 placeholder: shows only real account data. Resume, match, market and
// roadmap widgets arrive in later phases and will read from the API, never from fixtures.
export default function Dashboard() {
  const { user, logout } = useAuth();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button onClick={() => void logout()} className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100">
          Sign out
        </button>
      </header>
      <p className="mt-4">Signed in as <strong>{user?.email}</strong>.</p>
      <p className="mt-2 text-slate-600">
        No resumes, matches or insights yet — those features are built in later phases.
      </p>
    </main>
  );
}
