import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PlusIcon, TrashIcon } from "../components/icons";
import { ACCENTS, ResumePreview, ScaledPage } from "../components/ResumePreview";
import { Badge, Button, Card, ConfirmDialog, Field, Skeleton } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { timeAgo } from "../lib/time";
import { emptyContent, type ResumeContent, type ResumeFull, type ResumeSummary, type TemplateId, type TemplateInfo } from "../lib/types";

export function ResumesPage() {
  const toast = useToast();
  const [items, setItems] = useState<ResumeSummary[] | null>(null);
  const [toDelete, setToDelete] = useState<ResumeSummary | null>(null);

  useEffect(() => {
    api<{ resumes: ResumeSummary[] }>("/resumes").then((r) => setItems(r.resumes)).catch(() => { setItems([]); toast("Could not load resumes", "error"); });
  }, [toast]);

  async function remove() {
    if (!toDelete) return;
    try {
      await api(`/resumes/${toDelete.id}`, { method: "DELETE" });
      setItems((xs) => xs?.filter((x) => x.id !== toDelete.id) ?? null);
      toast("Resume deleted (its share link is gone too)");
    } catch { toast("Delete failed", "error"); }
    setToDelete(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold">Resumes</h1><p className="text-sm text-slate-600">Create, edit, export and share.</p></div>
        <Link to="/resumes/new"><Button><PlusIcon className="h-4 w-4" /> New resume</Button></Link>
      </header>

      {items === null && <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div>}
      {items?.length === 0 && (
        <Card className="animate-fade-up mt-6 p-10 text-center">
          <p className="text-lg font-bold">No resumes yet</p>
          <p className="mt-1 text-sm text-slate-600">Pick a template and start filling in your details.</p>
          <Link to="/resumes/new"><Button className="mt-4">Create your first resume</Button></Link>
        </Card>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items?.map((r, i) => (
          <Card key={r.id} className="animate-fade-up group overflow-hidden transition hover:-translate-y-1 hover:shadow-lg">
            <div style={{ animationDelay: `${i * 50}ms` }}>
              <Link to={`/resumes/${r.id}`} className="block p-4">
                <div className="h-2 rounded-full" style={{ background: ACCENTS[r.templateId] }} />
                <h2 className="mt-3 truncate font-bold group-hover:text-brand-700">{r.title}</h2>
                <p className="text-xs text-slate-500">Edited {timeAgo(r.updatedAt)}</p>
                <div className="mt-3 flex gap-2"><Badge tone="indigo">{r.templateId}</Badge>{r.shared && <Badge tone="green">shared</Badge>}</div>
              </Link>
              <div className="flex justify-between border-t border-slate-100 px-4 py-2">
                <Link to={`/resumes/${r.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Open</Link>
                <button onClick={() => setToDelete(r)} aria-label={`Delete ${r.title}`} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><TrashIcon className="h-4 w-4" /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <ConfirmDialog open={toDelete !== null} title="Delete this resume?" body={`"${toDelete?.title ?? ""}" and any share link will be permanently removed.`} confirmLabel="Delete" onConfirm={() => void remove()} onCancel={() => setToDelete(null)} />
    </div>
  );
}

const layoutSample = (): ResumeContent => ({
  ...emptyContent(),
  basics: { fullName: "Your Name", headline: "Your headline", email: "you@example.com", phone: "", location: "City", links: [] },
  summary: "Layout preview only — your own details go here.",
  skills: ["Skill one", "Skill two", "Skill three"],
  experience: [{ company: "Company", role: "Role", location: "", start: "2022", end: "", current: true, bullets: ["Achievement or responsibility"] }],
  education: [{ institution: "University", degree: "Degree", field: "Field", start: "2018", end: "2022", grade: "" }],
});

export function NewResumePage() {
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [title, setTitle] = useState("My resume");
  const [tpl, setTpl] = useState<TemplateId>("modern");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<{ templates: TemplateInfo[] }>("/resumes/templates").then((r) => setTemplates(r.templates)).catch(() => {}); }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const content = emptyContent();
      content.basics.email = user?.email ?? "";
      const r = await api<{ resume: ResumeFull }>("/resumes", { method: "POST", body: { title, templateId: tpl, content } });
      nav(`/resumes/${r.resume.id}`, { replace: true });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not create resume", "error");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-extrabold">New resume</h1>
      <form onSubmit={create} className="mt-5 space-y-6">
        <div className="max-w-md"><Field label="Resume name" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} hint="Only you see this name." /></div>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Choose a template</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-3">
            {templates.map((t) => (
              <label key={t.id} className={`cursor-pointer overflow-hidden rounded-xl border-2 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-md ${tpl === t.id ? "border-brand-600 ring-2 ring-brand-500/30" : "border-slate-200"}`}>
                <input type="radio" name="tpl" className="sr-only" checked={tpl === t.id} onChange={() => setTpl(t.id)} />
                <div className="h-56 overflow-hidden rounded border border-slate-100"><ScaledPage><ResumePreview content={layoutSample()} templateId={t.id} /></ScaledPage></div>
                <p className="mt-2 font-bold">{t.name}</p>
                <p className="text-xs text-slate-600">{t.description}</p>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create and start editing"}</Button>
      </form>
    </div>
  );
}
