import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { scoreResume } from "../lib/resume/ats";
import { DEMO_JDS, DEMO_RESUMES } from "../lib/resume/demo";
import { fileToText } from "../lib/resume/extract";
import { parseResume, resumeToText } from "../lib/resume/parser";
import type { ParsedResume } from "../lib/resume/types";

const input = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-indigo-500";
const missing = "border-amber-400 bg-amber-50";
const btn = "rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100";
const primary = "rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700";

const verdict = (n: number) =>
  n >= 80 ? { label: "Excellent", color: "text-green-600", bar: "bg-green-500" }
  : n >= 60 ? { label: "Good – a few fixes", color: "text-amber-600", bar: "bg-amber-500" }
  : { label: "Needs work", color: "text-red-600", bar: "bg-red-500" };

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block text-xs font-semibold text-slate-500">
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={`${input} mt-1 font-normal text-slate-900 ${value ? "" : missing}`} />
    </label>
  );
}
function Lines({ label, value, onChange, rows = 4 }: { label: string; value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  return (
    <label className="block text-xs font-semibold text-slate-500">
      {label} <span className="font-normal">(one per line)</span>
      <textarea
        rows={rows}
        defaultValue={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))}
        className={`${input} mt-1 font-normal text-slate-900`}
      />
    </label>
  );
}
function Section({ title, onAdd, children }: { title: string; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
        {onAdd && <button className={btn} onClick={onAdd}>+ Add</button>}
      </div>
      {children}
    </section>
  );
}

export default function ResumeStudio() {
  const [raw, setRaw] = useState("");
  const [resume, setResume] = useState<ParsedResume | null>(null);
  const [baseline, setBaseline] = useState(0);
  const [jdId, setJdId] = useState("swe");
  const [jdText, setJdText] = useState(DEMO_JDS[0]?.text ?? "");
  const [tab, setTab] = useState<"edit" | "raw" | "preview">("edit");
  const [paste, setPaste] = useState("");
  const [skillIn, setSkillIn] = useState("");
  const [status, setStatus] = useState("");
  const [loadKey, setLoadKey] = useState(0); // remounts uncontrolled textareas after a (re)parse / add / remove
  const fileRef = useRef<HTMLInputElement>(null);

  const report = useMemo(() => (resume ? scoreResume(resume, jdText) : null), [resume, jdText]);

  function load(text: string, jd = jdText) {
    const parsed = parseResume(text);
    setRaw(text); setResume(parsed); setBaseline(scoreResume(parsed, jd).total); setLoadKey((k) => k + 1); setTab("edit"); setStatus("");
  }
  function loadDemo(id: string) {
    const d = DEMO_RESUMES.find((r) => r.id === id);
    const jd = DEMO_JDS.find((j) => j.id === d?.jdId);
    if (!d || !jd) return;
    setJdId(jd.id); setJdText(jd.text); load(d.text, jd.text);
  }
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setStatus(`Reading ${f.name}…`);
      const text = await fileToText(f);
      if (text.trim().length < 40) return setStatus("Could not extract text (scanned PDF?). Try pasting the text instead.");
      load(text);
    } catch (err) { setStatus(err instanceof Error ? err.message : "Could not read file"); }
    e.target.value = "";
  }
  const patch = (p: Partial<ParsedResume>) => setResume((r) => (r ? { ...r, ...p } : r));
  const setItem = <K extends "experience" | "education" | "projects">(k: K, i: number, p: Partial<ParsedResume[K][number]>) =>
    setResume((r) => (r ? { ...r, [k]: r[k].map((x, j) => (j === i ? { ...x, ...p } : x)) } : r));
  const addItem = (k: "experience" | "education" | "projects") => {
    const blank = { experience: { title: "", company: "", location: "", start: "", end: "", bullets: [] }, education: { degree: "", school: "", location: "", year: "", gpa: "" }, projects: { name: "", desc: "", bullets: [] } }[k];
    setResume((r) => (r ? { ...r, [k]: [...r[k], blank] } : r)); setLoadKey((n) => n + 1);
  };
  const delItem = (k: "experience" | "education" | "projects", i: number) => {
    setResume((r) => (r ? { ...r, [k]: r[k].filter((_, j) => j !== i) } : r)); setLoadKey((n) => n + 1);
  };
  const addSkill = (s: string) => {
    const v = s.trim();
    if (!v) return;
    setResume((r) => (r && !r.skills.some((x) => x.toLowerCase() === v.toLowerCase()) ? { ...r, skills: [...r.skills, v] } : r));
  };
  function download(name: string, content: string, type: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  const slug = (resume?.name || "resume").toLowerCase().replace(/\s+/g, "_");
  const v = report ? verdict(report.total) : null;
  const delta = report ? report.total - baseline : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-2xl font-bold">Resume Studio</h1>
        <p className="text-sm text-slate-600">Parse a resume, edit the extracted data and check its ATS score.</p>
      </header>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">1 · Load a resume</h2>
        <p className="mb-3 text-sm text-slate-500">Demo resumes below are fictional sample data for showing the feature. Your own uploads are parsed in the browser and not sent anywhere.</p>
        <div className="grid gap-3 sm:grid-cols-3" aria-label="Demo resumes">
          {DEMO_RESUMES.map((d) => (
            <button key={d.id} onClick={() => loadDemo(d.id)} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:border-indigo-500 hover:bg-indigo-50">
              <span className="block text-sm font-semibold">Demo: {d.label}</span>
              <span className="block text-xs text-slate-500">{d.role}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={() => fileRef.current?.click()} className="flex-1 basis-60 rounded-lg border-2 border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 hover:border-indigo-500">
            <b>Upload a resume</b> (PDF, DOCX or TXT)
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" hidden onChange={(e) => void onFile(e)} aria-label="Upload resume file" />
          <div className="flex flex-[2] basis-80 flex-col gap-2">
            <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="…or paste resume text here" className={input} />
            <div><button className={primary} onClick={() => (paste.trim().length < 40 ? setStatus("Paste more resume text first.") : load(paste))}>Parse pasted text</button></div>
          </div>
        </div>
        {status && <p role="status" className="mt-2 text-sm text-amber-700">{status}</p>}
      </section>

      {resume && report && v && (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">2 · Review & edit extracted data</h2>
            <p className="mb-3 text-sm text-slate-500">
              Found {resume.experience.length} job(s), {resume.education.length} education entr{resume.education.length === 1 ? "y" : "ies"}, {resume.skills.length} skills. Empty fields are highlighted.
            </p>
            <div className="flex gap-1 border-b border-slate-200" role="tablist">
              {([["edit", "Edit data"], ["raw", "Raw text"], ["preview", "ATS plain-text view"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm font-semibold ${tab === k ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-500"}`}>{l}</button>
              ))}
            </div>

            {tab === "raw" && <pre className="mt-3 max-h-[560px] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{raw}</pre>}
            {tab === "preview" && <pre className="mt-3 max-h-[560px] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{resumeToText(resume)}</pre>}

            {tab === "edit" && (
              <div key={loadKey}>
                <Section title="Personal details">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Full name" value={resume.name} onChange={(x) => patch({ name: x })} />
                    <Field label="Headline / title" value={resume.title} onChange={(x) => patch({ title: x })} />
                    <Field label="Email" type="email" value={resume.email} onChange={(x) => patch({ email: x })} />
                    <Field label="Phone" value={resume.phone} onChange={(x) => patch({ phone: x })} />
                    <Field label="Location" value={resume.location} onChange={(x) => patch({ location: x })} />
                    <Field label="LinkedIn" value={resume.linkedin} onChange={(x) => patch({ linkedin: x })} />
                    <Field label="GitHub" value={resume.github} onChange={(x) => patch({ github: x })} />
                    <Field label="Website" value={resume.website} onChange={(x) => patch({ website: x })} />
                  </div>
                </Section>
                <Section title="Summary">
                  <textarea aria-label="Summary" rows={3} value={resume.summary} onChange={(e) => patch({ summary: e.target.value })} className={`${input} ${resume.summary ? "" : missing}`} />
                </Section>

                <Section title="Experience" onAdd={() => addItem("experience")}>
                  {resume.experience.map((e, i) => (
                    <div key={i} className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex justify-between text-sm font-semibold">Job {i + 1}<button className="text-red-600" onClick={() => delItem("experience", i)}>Remove</button></div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Job title" value={e.title} onChange={(x) => setItem("experience", i, { title: x })} />
                        <Field label="Company" value={e.company} onChange={(x) => setItem("experience", i, { company: x })} />
                      </div>
                      <div className="my-3 grid gap-3 sm:grid-cols-3">
                        <Field label="Location" value={e.location} onChange={(x) => setItem("experience", i, { location: x })} />
                        <Field label="Start" value={e.start} onChange={(x) => setItem("experience", i, { start: x })} />
                        <Field label="End" value={e.end} onChange={(x) => setItem("experience", i, { end: x })} />
                      </div>
                      <Lines label="Achievements" rows={5} value={e.bullets} onChange={(x) => setItem("experience", i, { bullets: x })} />
                    </div>
                  ))}
                </Section>

                <Section title="Education" onAdd={() => addItem("education")}>
                  {resume.education.map((e, i) => (
                    <div key={i} className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex justify-between text-sm font-semibold">Education {i + 1}<button className="text-red-600" onClick={() => delItem("education", i)}>Remove</button></div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Degree" value={e.degree} onChange={(x) => setItem("education", i, { degree: x })} />
                        <Field label="School" value={e.school} onChange={(x) => setItem("education", i, { school: x })} />
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <Field label="Location" value={e.location} onChange={(x) => setItem("education", i, { location: x })} />
                        <Field label="Year(s)" value={e.year} onChange={(x) => setItem("education", i, { year: x })} />
                        <Field label="GPA" value={e.gpa} onChange={(x) => setItem("education", i, { gpa: x })} />
                      </div>
                    </div>
                  ))}
                </Section>

                <Section title="Skills">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {resume.skills.map((s, i) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pl-3 pr-1.5 text-sm text-indigo-700">
                        {s}<button aria-label={`Remove ${s}`} onClick={() => patch({ skills: resume.skills.filter((_, j) => j !== i) })}>×</button>
                      </span>
                    ))}
                  </div>
                  <input aria-label="Add skill" value={skillIn} onChange={(e) => setSkillIn(e.target.value)} placeholder="Type a skill and press Enter" className={`${input} ${resume.skills.length ? "" : missing}`}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(skillIn); setSkillIn(""); } }} />
                </Section>

                <Section title="Projects" onAdd={() => addItem("projects")}>
                  {resume.projects.map((p, i) => (
                    <div key={i} className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex justify-between text-sm font-semibold">Project {i + 1}<button className="text-red-600" onClick={() => delItem("projects", i)}>Remove</button></div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Name" value={p.name} onChange={(x) => setItem("projects", i, { name: x })} />
                        <Field label="Description / tech" value={p.desc} onChange={(x) => setItem("projects", i, { desc: x })} />
                      </div>
                      <div className="mt-3"><Lines label="Details" rows={2} value={p.bullets} onChange={(x) => setItem("projects", i, { bullets: x })} /></div>
                    </div>
                  ))}
                </Section>
                <Section title="Certifications"><Lines label="Certifications" rows={3} value={resume.certs} onChange={(x) => patch({ certs: x })} /></Section>
                <Section title="Awards"><Lines label="Awards" rows={2} value={resume.awards} onChange={(x) => patch({ awards: x })} /></Section>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button className={primary} onClick={() => download(`${slug}.json`, JSON.stringify(resume, null, 2), "application/json")}>Download JSON</button>
              <button className={btn} onClick={() => download(`${slug}_ats.txt`, resumeToText(resume), "text/plain")}>Download ATS .txt</button>
              <button className={btn} onClick={() => void navigator.clipboard?.writeText(resumeToText(resume)).then(() => setStatus("Copied to clipboard."))}>Copy text</button>
              <button className={btn} onClick={() => load(raw)}>Re-parse original</button>
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">3 · ATS score</h2>
              <p className="mb-3 text-sm text-slate-500">Updates live as you edit.</p>
              <div className="flex items-center gap-4">
                <div className={`text-5xl font-bold ${v.color}`} aria-label="ATS score">{report.total}<span className="text-lg font-normal text-slate-400"> / 100</span></div>
                <div>
                  <div className={`font-semibold ${v.color}`}>{v.label}</div>
                  <div className={`text-sm ${delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-slate-500"}`}>
                    {delta === 0 ? "Original parsed score" : `${delta > 0 ? "▲ +" : "▼ "}${delta} since parsing`}
                  </div>
                </div>
              </div>
              <label className="mt-4 block text-xs font-semibold text-slate-500">Match against job description
                <select value={jdId} className={`${input} mt-1`} onChange={(e) => { setJdId(e.target.value); const j = DEMO_JDS.find((x) => x.id === e.target.value); if (j && j.id !== "custom") setJdText(j.text); }}>
                  {DEMO_JDS.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
                </select>
              </label>
              <textarea aria-label="Job description" rows={4} value={jdText} onChange={(e) => { setJdText(e.target.value); setJdId("custom"); }} className={`${input} mt-2`} placeholder="Job description text…" />
              <div className="mt-4 space-y-3">
                {report.cats.map((c) => {
                  const p = c.score / c.max;
                  return (
                    <div key={c.name}>
                      <div className="flex justify-between text-sm"><b>{c.name}</b><span>{Math.round(c.score)}/{c.max}</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100"><div className={`h-full ${p >= 0.8 ? "bg-green-500" : p >= 0.5 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${p * 100}%` }} /></div>
                      <div className="text-xs text-slate-500">{c.note}</div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">Keywords</h2>
              <p className="text-sm text-slate-500">{report.kwCount ? `${report.hit.length} of ${report.kwCount} job keywords found.` : "Pick or paste a job description."}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{report.hit.map((k) => <span key={k} className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">✓ {k}</span>)}</div>
              {report.miss.length > 0 && <p className="mt-3 text-sm text-slate-500">Missing (click to add to skills):</p>}
              <div className="mt-1 flex flex-wrap gap-1.5">{report.miss.map((k) => <button key={k} onClick={() => addSkill(k)} className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">+ {k}</button>)}</div>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="mb-2 font-semibold">Suggestions</h2>
              {report.tips.length === 0 && <p className="rounded bg-slate-50 p-2 text-sm">✅ No issues found.</p>}
              {report.tips.map((t, i) => (
                <p key={i} className={`mb-1.5 rounded p-2 text-sm ${t.sev === "high" ? "bg-red-50" : t.sev === "med" ? "bg-amber-50" : "bg-slate-50"}`}>
                  {t.sev === "high" ? "🔴" : t.sev === "med" ? "🟠" : "⚪"} {t.msg}
                </p>
              ))}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
