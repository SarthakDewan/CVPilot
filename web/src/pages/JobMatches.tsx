import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ModeNote, SCAM_DISCLAIMER, ScamBadge, ScamDetail, BAND } from "../components/ScamUI";
import { Badge, Button, Card, Field, Skeleton } from "../components/ui";
import { api, ApiError } from "../lib/api";
import type { JobResult, ResumeSummary } from "../lib/types";

export function formatSalary(s: JobResult["salary"]): string | null {
  if (s.min === null && s.max === null) return null;
  const fmt = (n: number) => {
    try { return new Intl.NumberFormat("en", { style: "currency", currency: s.currency || "USD", maximumFractionDigits: 0 }).format(n); } catch { return String(Math.round(n)); }
  };
  const range = s.min !== null && s.max !== null && s.min !== s.max ? `${fmt(s.min)} – ${fmt(s.max)}` : fmt((s.min ?? s.max) as number);
  return s.predicted ? `${range} (estimated)` : range;
}

export default function JobMatches() {
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);
  const [resumeId, setResumeId] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [k, setK] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ results: JobResult[]; mode: "hybrid" | "rule-only"; fetched: number } | null>(null);

  useEffect(() => {
    api<{ resumes: ResumeSummary[] }>("/resumes").then((r) => { setResumes(r.resumes); setResumeId(r.resumes[0]?.id ?? ""); }).catch(() => setResumes([]));
  }, []);

  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setData(await api("/jobs/search", { method: "POST", body: { role, location, k, resumeId: resumeId || undefined } }));
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-extrabold">Job Matches</h1>
      <p className="mt-1 text-sm text-slate-600">Live listings ranked by how closely they match your resume, each screened for scam indicators.</p>

      <Card className="mt-6 p-5">
        <form onSubmit={search} className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" value={role} onChange={(e) => setRole(e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. Data Analyst" />
          <Field label="Location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="e.g. Bengaluru (optional)" />
          <div className="text-sm font-medium text-slate-700">
            <label htmlFor="resume">Match against resume</label>
            <select id="resume" value={resumeId} onChange={(e) => setResumeId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">Profile only (no resume)</option>
              {resumes?.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
          <div className="text-sm font-medium text-slate-700">
            <label htmlFor="k">Results</label>
            <select id="k" value={k} onChange={(e) => setK(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {[5, 10, 20, 30].map((n) => <option key={n} value={n}>Top {n}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy || role.trim().length < 2}>{busy ? "Searching…" : "Find jobs"}</Button></div>
        </form>
        {resumes?.length === 0 && <p className="mt-3 text-sm text-slate-600">Tip: <Link className="font-semibold text-brand-700 hover:underline" to="/resumes/new">create a resume</Link> so matching can use your skills.</p>}
        <p className="mt-3 text-xs text-slate-500">Listings come from Adzuna. Adzuna provides only a short description snippet, so matching and scam checks see that snippet, not the full posting.</p>
      </Card>

      {busy && <div className="mt-6 space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}
      {error && <p role="alert" className="animate-fade-up mt-6 rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}

      {data && !busy && (
        <section className="mt-6 space-y-4" aria-label="Results">
          <ModeNote mode={data.mode} />
          <p className="text-sm text-slate-600">Showing the top {data.results.length} of {data.fetched} listings fetched.</p>
          {data.results.length === 0 && <Card className="p-6 text-center text-slate-600">No listings found. Try a broader role or remove the location.</Card>}
          {data.results.map((j, i) => <JobCard key={j.id} job={j} index={i} />)}
          <p className="text-xs text-slate-500">{SCAM_DISCLAIMER}</p>
        </section>
      )}
    </div>
  );
}

function JobCard({ job: j, index }: { job: JobResult; index: number }) {
  const salary = formatSalary(j.salary);
  return (
    <Card className={`animate-fade-up overflow-hidden border-2 transition hover:-translate-y-0.5 hover:shadow-md ${j.scam.band === "safe" ? "border-transparent" : BAND[j.scam.band].ring}`}>
      <article className="p-5" style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}>
        {j.scam.band === "high" && <p role="note" className="-mx-5 -mt-5 mb-4 bg-rose-600 px-5 py-1.5 text-xs font-bold text-white">⚠ High scam risk: read the warnings below before engaging.</p>}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{j.url ? <a href={j.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-brand-700 hover:underline">{j.title}</a> : j.title}</h2>
            <p className="text-sm text-slate-600">{[j.company, j.location].filter(Boolean).join(" · ") || "Company not listed"}</p>
            {salary && <p className="mt-0.5 text-sm font-medium text-slate-700">{salary}</p>}
          </div>
          <div className="flex items-center gap-3">
            <ScamBadge band={j.scam.band} />
            <div className="text-center" title={`Cosine similarity ${j.cosine}`}><div className="text-2xl font-extrabold text-brand-700">{j.score}</div><div className="text-[10px] uppercase tracking-wide text-slate-500">match</div></div>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all duration-700" style={{ width: `${j.score}%` }} /></div>
        <p className="mt-3 line-clamp-3 text-sm text-slate-700">{j.description}</p>
        {j.matchedTerms.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="text-xs text-slate-500">Shared with your profile:</span>{j.matchedTerms.map((t) => <Badge key={t} tone="green">{t}</Badge>)}</div>
        )}
        <details className="mt-3 rounded-lg border border-slate-200 p-3 open:bg-slate-50">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Why this risk rating?</summary>
          <div className="mt-3"><ScamDetail s={j.scam} /></div>
        </details>
      </article>
    </Card>
  );
}
