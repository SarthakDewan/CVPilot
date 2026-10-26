import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PlusIcon } from "../components/icons";
import { Badge, Card, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ResumeSummary } from "../lib/types";
import { timeAgo } from "../lib/time";

const UPCOMING = [
  ["Market Insights & Skill Roadmap", "Skill demand and salary stats, and a learning plan for your gaps.", 6],
] as const;

export default function Dashboard() {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);

  useEffect(() => {
    api<{ resumes: ResumeSummary[] }>("/resumes").then((r) => setResumes(r.resumes)).catch(() => setResumes([]));
  }, []);

  const name = user?.email.split("@")[0] ?? "";
  const stats = [
    { label: "Resumes", value: resumes?.length },
    { label: "Shared links active", value: resumes?.filter((r) => r.shared).length },
    { label: "Best ATS score", value: resumes ? (resumes.some((r) => r.atsScore !== null) ? Math.max(...resumes.map((r) => r.atsScore ?? 0)) : "–") : undefined },
    { label: "Templates used", value: resumes ? new Set(resumes.map((r) => r.templateId)).size : undefined },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <header className="animate-fade-up rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-violet-700 p-6 text-white shadow-lg sm:p-8">
        <p className="text-sm text-brand-100">Welcome back</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Hi, {name} 👋</h1>
        <p className="mt-2 max-w-xl text-sm text-brand-100">Build your resume now; Check it against a job description on the ATS Score page; find ranked jobs with scam-risk checks on Job Matches; market insights are coming next.</p>
        <Link to="/resumes/new" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow transition hover:-translate-y-0.5 hover:shadow-lg">
          <PlusIcon className="h-4 w-4" /> New resume
        </Link>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Your stats">
        {stats.map((s, i) => (
          <Card key={s.label} className="animate-fade-up p-5 transition hover:-translate-y-0.5 hover:shadow-md" >
            <div style={{ animationDelay: `${i * 70}ms` }}>
              <p className="text-sm font-medium text-slate-500">{s.label}</p>
              {s.value === undefined ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-1 text-3xl font-extrabold text-brand-900">{s.value}</p>}
            </div>
          </Card>
        ))}
      </section>

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
              <div className="flex shrink-0 gap-2"><Badge tone="indigo">{r.templateId}</Badge>{r.shared && <Badge tone="green">shared</Badge>}</div>
            </Link>
          ))}
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">Coming next</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {UPCOMING.map(([t, d, p]) => (
            <Card key={t} className="p-5"><Badge tone="amber">Phase {p}</Badge><h3 className="mt-2 font-bold">{t}</h3><p className="mt-1 text-sm text-slate-600">{d}</p></Card>
          ))}
        </div>
      </section>
    </div>
  );
}
