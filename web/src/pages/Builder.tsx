import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bullets, Repeater, SuggestButton, TagInput } from "../components/editors";
import { CheckIcon, DownloadIcon, LinkIcon, PlusIcon, TrashIcon } from "../components/icons";
import { ResumePreview, ScaledPage } from "../components/ResumePreview";
import { Badge, Button, Card, Field, Skeleton, TextArea } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { completeness, type ResumeContent, type ResumeFull, type TemplateId, type TemplateInfo } from "../lib/types";

const TABS = ["Basics", "Summary", "Skills", "Experience", "Projects", "Education", "Achievements", "Certifications"] as const;
type Tab = (typeof TABS)[number];
type SaveState = "saved" | "unsaved" | "saving" | "error";

export default function Builder() {
  const { id = "" } = useParams();
  const [resume, setResume] = useState<ResumeFull | null>(null);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState<TemplateId>("modern");
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [tab, setTab] = useState<Tab>("Basics");
  const [save, setSave] = useState<SaveState>("saved");
  const [notFound, setNotFound] = useState(false);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const latest = useRef({ title, templateId, content });
  useEffect(() => { latest.current = { title, templateId, content }; });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    api<{ resume: ResumeFull }>(`/resumes/${id}`)
      .then((r) => { setResume(r.resume); setTitle(r.resume.title); setTemplateId(r.resume.templateId); setContent(r.resume.content); })
      .catch(() => setNotFound(true));
    api<{ templates: TemplateInfo[] }>("/resumes/templates").then((r) => setTemplates(r.templates)).catch(() => {});
  }, [id]);

  const saveNow = useCallback(async () => {
    clearTimeout(timer.current);
    const { title, templateId, content } = latest.current;
    if (!content) return;
    setSave("saving");
    try {
      const r = await api<{ resume: ResumeFull }>(`/resumes/${id}`, { method: "PUT", body: { title: title.trim() || "Untitled", templateId, content } });
      setResume((prev) => (prev ? { ...prev, updatedAt: r.resume.updatedAt } : prev));
      setSave("saved");
    } catch { setSave("error"); }
  }, [id]);

  const touch = useCallback(() => {
    setSave("unsaved");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveNow(), 900);
  }, [saveNow]);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === "unsaved" || save === "saving") e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const update = (fn: (c: ResumeContent) => ResumeContent) => { setContent((c) => (c ? fn(c) : c)); touch(); };
  const health = useMemo(() => (content ? completeness(content) : null), [content]);

  if (notFound) return <div className="p-10 text-center"><p className="font-semibold">Resume not found.</p><Link className="text-brand-700 underline" to="/resumes">Back to resumes</Link></div>;
  if (!content || !resume) return <div className="space-y-4 p-8"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>;

  const saveLabel = { saved: "All changes saved", unsaved: "Unsaved changes…", saving: "Saving…", error: "Save failed – retry" }[save];

  async function download(format: "pdf" | "docx") {
    await saveNow();
    window.location.assign(`/api/v1/resumes/${id}/export?format=${format}`);
  }

  const b = content.basics;
  const setB = (patch: Partial<typeof b>) => update((c) => ({ ...c, basics: { ...c.basics, ...patch } }));

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col lg:h-screen">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <Link to="/resumes" className="text-sm font-semibold text-slate-500 hover:text-brand-700">← Resumes</Link>
        <input
          aria-label="Resume name" value={title} maxLength={120}
          onChange={(e) => { setTitle(e.target.value); touch(); }}
          className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-lg font-bold hover:border-slate-300 focus:border-brand-500 focus:outline-none"
        />
        <button onClick={() => save === "error" && void saveNow()} className={`flex items-center gap-1.5 text-xs font-medium ${save === "error" ? "text-rose-600 underline" : "text-slate-500"}`} aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${{ saved: "bg-emerald-500", unsaved: "bg-amber-400", saving: "animate-pulse bg-brand-500", error: "bg-rose-500" }[save]}`} />{saveLabel}
        </button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void download("pdf")}><DownloadIcon className="h-4 w-4" /> PDF</Button>
          <Button variant="secondary" onClick={() => void download("docx")}><DownloadIcon className="h-4 w-4" /> DOCX</Button>
        </div>
      </header>

      <div className="flex border-b border-slate-200 bg-white lg:hidden" role="tablist">
        {(["edit", "preview"] as const).map((v) => (
          <button key={v} role="tab" aria-selected={mobileView === v} onClick={() => setMobileView(v)} className={`flex-1 py-2 text-sm font-semibold capitalize ${mobileView === v ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500"}`}>{v}</button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section className={`min-h-0 overflow-y-auto border-r border-slate-200 bg-slate-50 ${mobileView === "edit" ? "" : "hidden lg:block"}`} aria-label="Editor">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-3 pt-3 backdrop-blur">
            {health && (
              <div className="mb-2 flex items-center gap-3" title={health.missing.length ? `To add: ${health.missing.join(", ")}` : "All key sections present"}>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all duration-500" style={{ width: `${health.pct}%` }} /></div>
                <span className="text-xs font-semibold text-slate-600">{health.pct}% complete</span>
              </div>
            )}
            <div className="flex gap-1 overflow-x-auto pb-2" role="tablist" aria-label="Sections">
              {TABS.map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition ${tab === t ? "bg-brand-600 text-white shadow" : "text-slate-600 hover:bg-slate-200"}`}>{t}</button>
              ))}
            </div>
          </div>

          <div className="animate-fade-up space-y-5 p-4" key={tab}>
            {tab === "Basics" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name" value={b.fullName} onChange={(e) => setB({ fullName: e.target.value })} maxLength={120} />
                  <Field label="Headline" value={b.headline} onChange={(e) => setB({ headline: e.target.value })} maxLength={160} placeholder="e.g. Data Analyst" />
                  <Field label="Email" type="email" value={b.email} onChange={(e) => setB({ email: e.target.value })} />
                  <Field label="Phone" value={b.phone} onChange={(e) => setB({ phone: e.target.value })} maxLength={40} />
                  <Field label="Location" value={b.location} onChange={(e) => setB({ location: e.target.value })} maxLength={120} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Links</p>
                  {b.links.map((l, i) => (
                    <div key={i} className="mt-2 flex gap-2">
                      <input aria-label="Link label" placeholder="LinkedIn" value={l.label} onChange={(e) => setB({ links: b.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="w-1/3 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      <input aria-label="Link URL" placeholder="https://…" value={l.url} onChange={(e) => setB({ links: b.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      <button aria-label="Remove link" onClick={() => setB({ links: b.links.filter((_, j) => j !== i) })} className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                  ))}
                  {b.links.length < 6 && <Button variant="ghost" className="mt-1 !px-2 !py-1 text-xs" onClick={() => setB({ links: [...b.links, { label: "", url: "" }] })}><PlusIcon className="h-4 w-4" /> Add link</Button>}
                </div>
              </>
            )}

            {tab === "Summary" && (
              <>
                <TextArea label="Professional summary" rows={6} maxLength={1500} value={content.summary} onChange={(e) => update((c) => ({ ...c, summary: e.target.value }))} />
                <p className="text-xs text-slate-500">{content.summary.length}/1500 · Aim for 2–4 sentences.</p>
                <SuggestButton kind="summary" text={content.summary} onPick={(v) => update((c) => ({ ...c, summary: v }))} />
              </>
            )}

            {tab === "Skills" && <TagInput label="Skills" items={content.skills} placeholder="e.g. Python, SQL, React" onChange={(skills) => update((c) => ({ ...c, skills }))} />}

            {tab === "Experience" && (
              <Repeater
                title="Role" addLabel="Add experience" items={content.experience} onChange={(experience) => update((c) => ({ ...c, experience }))}
                blank={() => ({ company: "", role: "", location: "", start: "", end: "", current: false, bullets: [""] })}
                summary={(e) => [e.role, e.company].filter(Boolean).join(" · ")}
                render={(e, set) => (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Role" value={e.role} onChange={(ev) => set({ role: ev.target.value })} />
                      <Field label="Company" value={e.company} onChange={(ev) => set({ company: ev.target.value })} />
                      <Field label="Start" placeholder="Jan 2022" value={e.start} onChange={(ev) => set({ start: ev.target.value })} />
                      <Field label="End" placeholder="Mar 2024" value={e.end} disabled={e.current} onChange={(ev) => set({ end: ev.target.value })} />
                      <Field label="Location" value={e.location} onChange={(ev) => set({ location: ev.target.value })} />
                      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={e.current} onChange={(ev) => set({ current: ev.target.checked })} /> I currently work here</label>
                    </div>
                    <Bullets items={e.bullets} onChange={(bullets) => set({ bullets })} label="Achievements / responsibilities" />
                  </>
                )}
              />
            )}

            {tab === "Projects" && (
              <Repeater
                title="Project" addLabel="Add project" items={content.projects} onChange={(projects) => update((c) => ({ ...c, projects }))}
                blank={() => ({ name: "", link: "", description: "", tech: [], bullets: [] })}
                summary={(p) => p.name}
                render={(p, set) => (
                  <>
                    <Field label="Project name" value={p.name} onChange={(ev) => set({ name: ev.target.value })} />
                    <Field label="Link" value={p.link} onChange={(ev) => set({ link: ev.target.value })} placeholder="https://…" />
                    <TextArea label="Description" rows={2} maxLength={600} value={p.description} onChange={(ev) => set({ description: ev.target.value })} />
                    <TagInput label={`Tech (${p.name || "project"})`} items={p.tech} onChange={(tech) => set({ tech })} />
                    <Bullets items={p.bullets} onChange={(bullets) => set({ bullets })} />
                  </>
                )}
              />
            )}

            {tab === "Education" && (
              <Repeater
                title="Education" addLabel="Add education" items={content.education} onChange={(education) => update((c) => ({ ...c, education }))}
                blank={() => ({ institution: "", degree: "", field: "", start: "", end: "", grade: "" })}
                summary={(e) => [e.degree, e.institution].filter(Boolean).join(" · ")}
                render={(e, set) => (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Institution" value={e.institution} onChange={(ev) => set({ institution: ev.target.value })} />
                    <Field label="Degree" value={e.degree} onChange={(ev) => set({ degree: ev.target.value })} />
                    <Field label="Field of study" value={e.field} onChange={(ev) => set({ field: ev.target.value })} />
                    <Field label="Grade / GPA" value={e.grade} onChange={(ev) => set({ grade: ev.target.value })} />
                    <Field label="Start" value={e.start} onChange={(ev) => set({ start: ev.target.value })} />
                    <Field label="End" value={e.end} onChange={(ev) => set({ end: ev.target.value })} />
                  </div>
                )}
              />
            )}

            {tab === "Achievements" && <Bullets items={content.achievements} label="Achievement" onChange={(achievements) => update((c) => ({ ...c, achievements }))} />}

            {tab === "Certifications" && (
              <Repeater
                title="Certification" addLabel="Add certification" items={content.certifications} onChange={(certifications) => update((c) => ({ ...c, certifications }))}
                blank={() => ({ name: "", issuer: "", year: "" })}
                summary={(x) => x.name}
                render={(x, set) => (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Name" value={x.name} onChange={(ev) => set({ name: ev.target.value })} />
                    <Field label="Issuer" value={x.issuer} onChange={(ev) => set({ issuer: ev.target.value })} />
                    <Field label="Year" value={x.year} maxLength={10} onChange={(ev) => set({ year: ev.target.value })} />
                  </div>
                )}
              />
            )}

            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              Privacy: “Improve wording” sends only the single piece of text you select to a third-party LLM provider (Google Gemini). Nothing is sent unless you click it.
            </p>
          </div>
        </section>

        <section className={`min-h-0 overflow-y-auto bg-slate-200/60 p-4 ${mobileView === "preview" ? "" : "hidden lg:block"}`} aria-label="Preview">
          <div className="mx-auto mb-3 flex max-w-[820px] flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-lg bg-white p-1 shadow-sm" role="radiogroup" aria-label="Template">
              {(templates.length ? templates : [{ id: "classic" }, { id: "modern" }, { id: "compact" }] as TemplateInfo[]).map((t) => (
                <button key={t.id} role="radio" aria-checked={templateId === t.id} onClick={() => { setTemplateId(t.id); touch(); }} className={`rounded-md px-3 py-1 text-sm font-semibold capitalize transition ${templateId === t.id ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t.id}</button>
              ))}
            </div>
            <SharePanel resume={resume} onChange={(patch) => setResume({ ...resume, ...patch })} />
          </div>
          <div className="mx-auto max-w-[820px]"><ScaledPage><ResumePreview content={content} templateId={templateId} /></ScaledPage></div>
        </section>
      </div>
    </div>
  );
}

function SharePanel({ resume, onChange }: { resume: ResumeFull; onChange(p: Partial<ResumeFull>): void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [days, setDays] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const r = await api<{ path: string; expiresAt: string | null }>(`/resumes/${resume.id}/share`, { method: "POST", body: days ? { expiresInDays: Number(days) } : {} });
      setLink(`${window.location.origin}${r.path}`);
      onChange({ shared: true, shareExpiresAt: r.expiresAt });
    } catch (e) { toast(e instanceof ApiError ? e.message : "Could not create link", "error"); }
    setBusy(false);
  }
  async function revoke() {
    setBusy(true);
    try { await api(`/resumes/${resume.id}/share`, { method: "DELETE" }); setLink(null); onChange({ shared: false, shareExpiresAt: null }); toast("Share link revoked"); }
    catch { toast("Could not revoke link", "error"); }
    setBusy(false);
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch { toast("Copy failed – select the link manually", "error"); }
  }

  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <LinkIcon className="h-4 w-4" /> Share {resume.shared && <Badge tone="green">on</Badge>}
      </Button>
      {open && (
        <Card className="animate-fade-up absolute right-0 z-20 mt-2 w-80 space-y-3 p-4 shadow-xl">
          <p className="text-sm font-bold">Share a read-only link</p>
          {resume.shared ? (
            <>
              {link ? (
                <>
                  <input readOnly value={link} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs" />
                  <div className="flex gap-2"><Button onClick={() => void copy()} className="flex-1"><CheckIcon className="h-4 w-4" /> Copy</Button><Button variant="danger" disabled={busy} onClick={() => void revoke()}>Revoke</Button></div>
                  <p className="text-xs text-slate-500">This link is shown only now. Anyone with it can view this resume until you revoke it{resume.shareExpiresAt ? ` or it expires on ${new Date(resume.shareExpiresAt).toLocaleDateString()}` : ""}.</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-600">A link is active{resume.shareExpiresAt ? ` until ${new Date(resume.shareExpiresAt).toLocaleDateString()}` : ""}. For security the URL isn’t stored, so it can’t be shown again.</p>
                  <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => void create()} className="flex-1">New link (replaces old)</Button><Button variant="danger" disabled={busy} onClick={() => void revoke()}>Revoke</Button></div>
                </>
              )}
            </>
          ) : (
            <>
              <label className="block text-xs font-medium text-slate-700">Expires after
                <select value={days} onChange={(e) => setDays(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Never (until revoked)</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
                </select>
              </label>
              <Button disabled={busy} onClick={() => void create()} className="w-full">Create link</Button>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
