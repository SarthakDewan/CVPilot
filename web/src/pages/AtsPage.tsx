import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { bandFor, ScoreRing } from "../components/ScoreRing";
import { Badge, Button, Card, Skeleton } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import type { AtsAnalysis, ResumeFull, ResumeSummary } from "../lib/types";

const MIN_JD = 50;

export default function AtsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);
  const [selected, setSelected] = useState(params.get("resume") ?? "");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<AtsAnalysis | null>(null);
  const [fresh, setFresh] = useState(false); // true when the result was just computed for the pasted JD
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ resumes: ResumeSummary[] }>("/resumes")
      .then((r) => {
        setResumes(r.resumes);
        setSelected((cur) => cur || r.resumes[0]?.id || "");
      })
      .catch(() => { setResumes([]); toast("Could not load resumes", "error"); });
  }, [toast]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    api<{ resume: ResumeFull }>(`/resumes/${selected}`)
      .then((r) => { if (!cancelled) { setResult(r.resume.ats); setFresh(false); } })
      .catch(() => { if (!cancelled) setResult(null); });
    return () => { cancelled = true; };
  }, [selected]);

  async function analyze() {
    setBusy(true);
    try {
      const r = await api<{ analysis: AtsAnalysis }>(`/resumes/${selected}/analyze`, { method: "POST", body: { jobDescription: jd } });
      setResult(r.analysis);
      setFresh(true);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Analysis failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const canRun = Boolean(selected) && jd.trim().length >= MIN_JD && !busy;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-extrabold">ATS Score</h1>
      <p className="mt-1 text-sm text-slate-600">Compare a resume with a job description and see exactly which keywords match and which are missing.</p>

      {resumes?.length === 0 ? (
        <Card className="mt-6 p-8 text-center"><p className="font-semibold">You need a resume first.</p><Link to="/resumes/new"><Button className="mt-3">Create a resume</Button></Link></Card>
      ) : (
        <Card className="mt-6 space-y-4 p-5">
          <div>
            <label htmlFor="resume" className="block text-sm font-medium text-slate-700">Resume</label>
            {resumes === null ? <Skeleton className="mt-1 h-10" /> : (
              <select id="resume" value={selected} onChange={(e) => { setSelected(e.target.value); setParams(e.target.value ? { resume: e.target.value } : {}); }}
                className="mt-1 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                {resumes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            )}
          </div>
          <div>
            <label htmlFor="jd" className="block text-sm font-medium text-slate-700">Job description</label>
            <textarea id="jd" rows={9} maxLength={20000} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the full job posting here…"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>{jd.trim().length < MIN_JD ? `At least ${MIN_JD} characters` : "Ready"}</span><span>{jd.length}/20000</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void analyze()} disabled={!canRun}>{busy ? "Analyzing…" : "Analyze match"}</Button>
            {busy && <span className="animate-pulse text-xs text-slate-500">The first run can take a little longer while the language model loads.</span>}
          </div>
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Privacy: your resume and the job description are processed by CVPilot’s own analysis service. Only the score and the matched/missing keyword lists are sent to a third-party LLM provider (Google Gemini) to write the explanation.
          </p>
        </Card>
      )}

      {busy && <div className="mt-6 space-y-3"><Skeleton className="h-40" /><Skeleton className="h-24" /></div>}
      {!busy && result && <Results r={result} fresh={fresh} />}
    </div>
  );
}

function Chips({ items, tone }: { items: string[]; tone: "green" | "amber" }) {
  const cls = tone === "green" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200";
  if (items.length === 0) return <p className="text-sm text-slate-500">None.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t, i) => <li key={t} className={`animate-fade-up rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`} style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}>{t}</li>)}
    </ul>
  );
}

function Results({ r, fresh }: { r: AtsAnalysis; fresh: boolean }) {
  const band = bandFor(r.score);
  return (
    <section className="animate-fade-up mt-6 space-y-4" aria-label="Analysis result">
      {!fresh && <p className="text-xs text-slate-500">Showing the last saved analysis{r.analyzedAt ? ` (${new Date(r.analyzedAt).toLocaleString()})` : ""}. The job description isn’t stored; paste one to re-run.</p>}
      <Card className="flex flex-col items-center gap-6 p-6 sm:flex-row">
        <ScoreRing score={r.score} />
        <div className="flex-1">
          <p className={`text-xl font-extrabold ${band.text}`}>{band.label}</p>
          <p className="mt-1 text-sm text-slate-600">
            <strong>{r.matched.length}</strong> job keywords found in your resume, <strong>{r.missing.length}</strong> missing.
          </p>
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            This 0–100 value is a <strong>rescaled semantic similarity</strong> (cosine similarity of text embeddings × 100), not a probability and not a prediction of whether you will be hired or pass any real employer’s ATS.
            {r.model && <> Model: {r.model}{r.cosine !== null && <>, raw cosine {r.cosine}</>}.</>}
          </p>
        </div>
      </Card>

      {(r.truncatedResume || r.truncatedJob) && (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          The embedding model reads only the first ~256 tokens of each text. {r.truncatedResume && "Your resume is longer than that, so later sections did not affect the score. "}
          {r.truncatedJob && "The job description is longer than that, so its later parts did not affect the score. "}
          The keyword lists below still cover the full text.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5"><h2 className="mb-3 flex items-center gap-2 font-bold">Matched keywords <Badge tone="green">{r.matched.length}</Badge></h2><Chips items={r.matched} tone="green" /></Card>
        <Card className="p-5">
          <h2 className="mb-1 flex items-center gap-2 font-bold">Missing keywords <Badge tone="amber">{r.missing.length}</Badge></h2>
          <p className="mb-3 text-xs text-slate-500">Most frequent in the job description first. Add a term only if it is true for you.</p>
          <Chips items={r.missing} tone="amber" />
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">Explanation</h2>
          <Badge tone={r.explanationSource === "gemini" ? "indigo" : "slate"}>{r.explanationSource === "gemini" ? "Written by Gemini" : "Template (no LLM)"}</Badge>
        </div>
        <p className="mt-2 text-sm text-slate-700">{r.explanation}</p>
      </Card>
    </section>
  );
}
