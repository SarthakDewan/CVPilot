import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, PlusIcon } from "../components/icons";
import { Badge, Button, Card, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { timeAgo } from "../lib/time";
import type { ResumeSummary, Roadmap } from "../lib/types";

/** Every figure here is read from the API; nothing is a placeholder. */
export default function Dashboard() {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null | undefined>(undefined);

  useEffect(() => {
    api<{ resumes: ResumeSummary[] }>("/resumes").then((r) => setResumes(r.resumes)).catch(() => setResumes([]));
    api<{ roadmap: Roadmap | null }>("/roadmap").then((r) => setRoadmap(r.roadmap)).catch(() => setRoadmap(null));
  }, []);

  const name = user?.email.split("@")[0] ?? "";
  const scores = resumes?.map((r) => r.atsScore).filter((s): s is number => s !== null) ?? [];
  const stats = [
    { label: "Resumes", value: resumes?.length, to: "/resumes" },
    { label: "Best ATS score", value: resumes ? (scores.length ? Math.max(...scores) : "–") : undefined, to: "/ats" },
    { label: "Active share links", value: resumes?.filter((r) => r.shared).length, to: "/resumes" },
    { label: "Roadmap progress", value: roadmap === undefined ? undefined : roadmap ? `${roadmap.progress.percent}%` : "–", to: "/roadmap" },
  ];

  const steps: { done: boolean; label: string; to: string }[] = resumes && roadmap !== undefined ? [
    { done: resumes.length > 0, label: "Create your first resume", to: "/resumes/new" },
    { done: scores.length > 0, label: "Check a resume against a job description", to: "/ats" },
    { done: roadmap !== null, label: "Build your skill roadmap", to: "/roadmap" },
  ] : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <header className="animate-fade-up rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-violet-700 p-6 text-white shadow-lg sm:p-8">
        <p className="text-sm text-brand-100">Welcome back</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Hi, {name} 👋</h1>
        <p className="mt-2 max-w-xl text-sm text-brand-100">Build a resume, score it against real job descriptions, find jobs with scam checks, and close your skill gaps.</p>
        <Link to="/resumes/new" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow transition hover:-translate-y-0.5 hover:shadow-lg">
          <PlusIcon className="h-4 w-4" /> New resume
        </Link>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Your stats">
        {stats.map((s, i) => (
          <Link key={s.label} to={s.to} className="animate-fade-up block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" style={{ animationDelay: `${i * 60}ms` }}>
            <p className="text-sm font-medium text-slate-500">{s.label}</p>
            {s.value === undefined ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-1 text-3xl font-extrabold text-brand-900">{s.value}</p>}
          </Link>
        ))}
      </section>

      {steps.length > 0 && !steps.every((s) => s.done) && (
        <Card className="mt-6 p-5">
          <h2 className="font-bold">Next steps</h2>
          <ul className="mt-3 space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span className={`grid h-5 w-5 place-items-center rounded-full ${s.done ? "bg-emerald-500 text-white" : "border border-slate-300"}`}>{s.done && <CheckIcon className="h-3.5 w-3.5" />}</span>
                {s.done ? <span className="text-slate-500 line-through">{s.label}</span> : <Link to={s.to} className="font-semibold text-brand-700 hover:underline">{s.label}</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent resumes</h2>
          <Link to="/resumes" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>
        </div>
        <Card className="mt-3 divide-y divide-slate-100">
          {resumes === null && <div className="space-y-3 p-4"><Skeleton className="h-5" /><Skeleton className="h-5 w-2/3" /></div>}
          {resumes?.length === 0 && <p className="p-6 text-sm text-slate-600">You have no resumes yet. <Link className="font-semibold text-brand-700 hover:underline" to="/resumes/new">Create your first one</Link>.</p>}
          {resumes?.slice(0, 5).map((r) => (
            <Link key={r.id} to={`/resumes/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50">
              <div className="min-w-0"><p className="truncate font-semibold">{r.title}</p><p className="text-xs text-slate-500">Edited {timeAgo(r.updatedAt)}</p></div>
              <div className="flex shrink-0 items-center gap-2">{r.atsScore !== null && <Badge tone="slate">ATS {r.atsScore}</Badge>}<Badge tone="indigo">{r.templateId}</Badge>{r.shared && <Badge tone="green">shared</Badge>}</div>
            </Link>
          ))}
        </Card>
      </section>

      {roadmap && roadmap.items.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Roadmap: <span className="capitalize">{roadmap.role}</span></h2><Link to="/roadmap" className="text-sm font-semibold text-brand-700 hover:underline">Open</Link></div>
          <Card className="mt-3 p-5">
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all duration-700" style={{ width: `${roadmap.progress.percent}%` }} /></div>
            <p className="mt-2 text-sm text-slate-600">{roadmap.progress.completed} of {roadmap.progress.total} skills completed. Next up: <strong>{roadmap.items.find((i) => i.status !== "completed")?.skill ?? "all done 🎉"}</strong></p>
          </Card>
        </section>
      )}
      <div className="mt-6"><Link to="/settings"><Button variant="ghost">Profile, data export and account settings →</Button></Link></div>
    </div>
  );
}
