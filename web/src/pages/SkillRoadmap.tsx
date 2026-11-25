import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Field, Skeleton } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import type { MilestoneStatus, ResumeSummary, Roadmap, RoadmapItem } from "../lib/types";
import { useProfileDefaults } from "../lib/useDefaults";

const STATUS: { id: MilestoneStatus; label: string }[] = [
  { id: "not_started", label: "Not started" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
];

export function progressOf(items: Pick<RoadmapItem, "status">[]) {
  const total = items.length;
  const completed = items.filter((i) => i.status === "completed").length;
  return { total, completed, percent: total ? Math.round((1000 * completed) / total) / 10 : 0 };
}

export default function SkillRoadmap() {
  const toast = useToast();
  const defaults = useProfileDefaults();
  const [roadmap, setRoadmap] = useState<Roadmap | null | undefined>(undefined);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [roleEdit, setRole] = useState<string | null>(null); // null = untouched, show the profile default
  const [locationEdit, setLocation] = useState<string | null>(null);
  const role = roleEdit ?? defaults.role;
  const location = locationEdit ?? defaults.location;
  const [resumeId, setResumeId] = useState("");
  const [tau, setTau] = useState(10);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ roadmap: Roadmap | null }>("/roadmap").then((r) => {
      setRoadmap(r.roadmap);
      if (r.roadmap) { setRole(r.roadmap.role); setLocation(r.roadmap.location); setTau(Math.round(r.roadmap.tau * 100)); }
    }).catch(() => setRoadmap(null));
    api<{ resumes: ResumeSummary[] }>("/resumes").then((r) => { setResumes(r.resumes); setResumeId(r.resumes[0]?.id ?? ""); }).catch(() => {});
  }, []);

  async function generate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ roadmap: Roadmap }>("/roadmap/generate", { method: "POST", body: { role, location, resumeId: resumeId || undefined, tau: tau / 100 } });
      setRoadmap(r.roadmap);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not build the roadmap", "error");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(skill: string, status: MilestoneStatus) {
    if (!roadmap) return;
    const before = roadmap;
    const items = roadmap.items.map((i) => (i.skill === skill ? { ...i, status } : i));
    setRoadmap({ ...roadmap, items, progress: { ...roadmap.progress, ...progressOf(items) } }); // optimistic
    try {
      const r = await api<{ roadmap: Roadmap }>("/roadmap/items", { method: "PATCH", body: { skill, status } });
      setRoadmap(r.roadmap);
    } catch {
      setRoadmap(before);
      toast("Could not save that change", "error");
    }
  }

  const p = roadmap?.progress;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-extrabold">Skill Roadmap</h1>
      <p className="mt-1 text-sm text-slate-600">The in-demand skills for your target role that your resume doesn’t show yet, most requested first.</p>

      <Card className="mt-6 p-5">
        <form onSubmit={generate} className="grid gap-4 sm:grid-cols-2">
          <Field label="Target role" value={role} onChange={(e) => setRole(e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. Backend Developer" />
          <Field label="Location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="optional" />
          <div className="text-sm font-medium text-slate-700">
            <label htmlFor="rs">Your skills come from</label>
            <select id="rs" value={resumeId} onChange={(e) => setResumeId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">Profile skills only</option>
              {resumes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
          <div className="text-sm font-medium text-slate-700">
            <label htmlFor="tau">Include skills in at least <strong>{tau}%</strong> of listings</label>
            <input id="tau" type="range" min={5} max={60} step={5} value={tau} onChange={(e) => setTau(Number(e.target.value))} className="mt-3 w-full accent-brand-600" />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || role.trim().length < 2}>{busy ? "Building…" : roadmap ? "Rebuild roadmap" : "Build roadmap"}</Button>
            {resumes.length === 0 && <span className="text-xs text-slate-600"><Link className="font-semibold text-brand-700 hover:underline" to="/resumes/new">Create a resume</Link> so your skills are counted.</span>}
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-500">Demand and salary data come from Adzuna listings. Only the role and the names of the skills (never your resume) are sent to Gemini to write the learning tips. Rebuilding keeps your progress on skills that remain.</p>
      </Card>

      {roadmap === undefined && <div className="mt-6"><Skeleton className="h-40" /></div>}
      {busy && <div className="mt-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}

      {roadmap && !busy && p && (
        <section className="animate-fade-up mt-6 space-y-4" aria-label="Roadmap">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold capitalize">Progress for {roadmap.role}{roadmap.location && ` · ${roadmap.location}`}</h2>
                <p className="text-xs text-slate-500">Based on {roadmap.listingCount} listings · threshold {Math.round(roadmap.tau * 100)}%</p>
              </div>
              <p className="text-3xl font-extrabold text-brand-700" aria-label={`${p.percent} percent complete`}>{p.percent}%</p>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Roadmap progress">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all duration-700" style={{ width: `${p.percent}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-600">{p.completed} of {p.total} completed{p.total > 0 && ` · ${roadmap.items.filter((i) => i.status === "in_progress").length} in progress`}</p>
          </Card>

          {roadmap.items.length === 0 ? (
            <Card className="p-6 text-center"><p className="font-semibold">No skill gaps found at this threshold 🎉</p><p className="mt-1 text-sm text-slate-600">Your resume already covers every skill in at least {Math.round(roadmap.tau * 100)}% of listings. Lower the threshold to see more.</p></Card>
          ) : (
            <ol className="space-y-3">
              {roadmap.items.map((it, i) => (
                <li key={it.skill}>
                  <Card className={`animate-fade-up p-5 transition ${it.status === "completed" ? "bg-emerald-50/60" : ""}`}>
                    <div style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className={`text-lg font-bold ${it.status === "completed" ? "text-slate-500 line-through" : ""}`}>{i + 1}. {it.skill}</h3>
                          <p className="text-xs text-slate-600">Appears in <strong>{it.count}</strong> of {roadmap.listingCount} listings ({Math.round(it.demand * 100)}%)</p>
                        </div>
                        <div role="radiogroup" aria-label={`Status of ${it.skill}`} className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
                          {STATUS.map((s) => (
                            <button key={s.id} role="radio" aria-checked={it.status === s.id} onClick={() => void setStatus(it.skill, s.id)}
                              className={`rounded-md px-2.5 py-1 transition ${it.status === s.id ? (s.id === "completed" ? "bg-emerald-600 text-white" : s.id === "in_progress" ? "bg-brand-600 text-white" : "bg-white text-slate-700 shadow-sm") : "text-slate-500 hover:text-slate-800"}`}>
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round(it.demand * 100)}%` }} /></div>
                      <p className="mt-3 text-sm text-slate-700">{it.guidance}</p>
                      <div className="mt-2"><Badge tone={it.guidanceSource === "gemini" ? "indigo" : "slate"}>{it.guidanceSource === "gemini" ? "Tip written by Gemini" : "Standard tip (no LLM)"}</Badge></div>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          )}

          {roadmap.covered.length > 0 && (
            <Card className="p-5">
              <h2 className="font-bold">Already on your resume</h2>
              <p className="text-xs text-slate-500">In-demand skills you already have.</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">{roadmap.covered.map((c) => <li key={c.skill}><Badge tone="green">{c.skill} · {Math.round(c.demand * 100)}%</Badge></li>)}</ul>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
