import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { TagInput } from "../components/editors";
import { DownloadIcon, TrashIcon } from "../components/icons";
import { Button, Card, Field, Skeleton, TextArea } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import type { Profile } from "../lib/types";

export default function Settings() {
  const toast = useToast();
  const nav = useNavigate();
  const { user, clearSession } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<{ mlService: boolean; classifier: boolean; gemini: boolean; adzuna: boolean } | null>(null);

  useEffect(() => { api<{ profile: Profile }>("/profile").then((r) => setProfile(r.profile)).catch(() => setProfile({})); }, []);
  useEffect(() => { api<NonNullable<typeof status>>("/status").then(setStatus).catch(() => setStatus(null)); }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const body = {
        fullName: profile.fullName ?? "",
        location: profile.location ?? "",
        professional: {
          headline: profile.professional?.headline ?? "",
          summary: profile.professional?.summary ?? "",
          ...(profile.professional?.yearsExperience !== undefined ? { yearsExperience: profile.professional.yearsExperience } : {}),
        },
        preferredRoles: profile.preferredRoles ?? [],
        skills: profile.skills ?? [],
      };
      const r = await api<{ profile: Profile }>("/profile", { method: "PUT", body });
      setProfile(r.profile);
      toast("Profile saved");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save profile", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    setDeleting(true);
    try {
      await api("/account/delete", { method: "POST", body: { password } });
      clearSession();
      nav("/login", { replace: true });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not delete the account", "error");
      setDeleting(false);
    }
  }

  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-extrabold">Settings</h1>

      <Card className="p-5">
        <h2 className="font-bold">Profile</h2>
        <p className="text-sm text-slate-600">Used for job matching and your skill roadmap, together with the resume you select.</p>
        {!profile ? <div className="mt-4 space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : (
          <form onSubmit={save} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" value={profile.fullName ?? ""} maxLength={120} onChange={(e) => set({ fullName: e.target.value })} />
              <Field label="Location" value={profile.location ?? ""} maxLength={120} onChange={(e) => set({ location: e.target.value })} />
              <Field label="Headline" value={profile.professional?.headline ?? ""} maxLength={160} onChange={(e) => set({ professional: { ...profile.professional, headline: e.target.value } })} />
              <Field label="Years of experience" type="number" min={0} max={60} value={profile.professional?.yearsExperience ?? ""}
                onChange={(e) => set({ professional: { ...profile.professional, yearsExperience: e.target.value === "" ? undefined : Number(e.target.value) } })} />
            </div>
            <TextArea label="Summary" rows={3} maxLength={2000} value={profile.professional?.summary ?? ""} onChange={(e) => set({ professional: { ...profile.professional, summary: e.target.value } })} />
            <TagInput label="Preferred roles" items={profile.preferredRoles ?? []} onChange={(preferredRoles) => set({ preferredRoles: preferredRoles.slice(0, 10) })} placeholder="e.g. Data Analyst" />
            <TagInput label="Skills" items={profile.skills ?? []} onChange={(skills) => set({ skills })} placeholder="e.g. Python, SQL" />
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
          </form>
        )}
      </Card>

      {status && (
        <Card className="p-5">
          <h2 className="font-bold">Service status</h2>
          <p className="text-sm text-slate-600">Which optional parts of this installation are switched on.</p>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {([
              ["Analysis service", status.mlService, "Needed for ATS scores, job matching and insights"],
              ["Job listings (Adzuna)", status.adzuna, "Add Adzuna keys to enable job search, insights and roadmaps"],
              ["Gemini explanations", status.gemini, "Without it, plain template text is used"],
              ["Scam classifier", status.classifier, "Without it, scam checks use rules only"],
            ] as const).map(([label, on, hint]) => (
              <li key={label} className="flex items-start gap-2">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${on ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden="true" />
                <span><span className="font-medium">{label}</span>: {on ? "on" : "off"}{!on && <span className="block text-xs text-slate-500">{hint}</span>}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="font-bold">Privacy</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Resume text is processed by CVPilot’s own services. <strong>It is sent to a third-party LLM provider (Google Gemini) only</strong> when you click “Improve wording” (that single snippet).</li>
          <li>ATS explanations send only the score and the matched/missing keyword lists. Roadmap tips send only the role and skill names. Scam checks are not sent to any LLM.</li>
          <li>Job listings and salary data come from Adzuna; your resume is never sent there.</li>
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold">Your data</h2>
        <p className="text-sm text-slate-600">Download everything stored for <strong>{user?.email}</strong> (profile, resumes, ATS results, roadmap) as JSON.</p>
        <a href="/api/v1/account/export" download><Button variant="secondary" className="mt-3"><DownloadIcon className="h-4 w-4" /> Export my data</Button></a>
      </Card>

      <Card className="border-rose-200 p-5">
        <h2 className="font-bold text-rose-700">Delete account</h2>
        <p className="text-sm text-slate-600">Permanently deletes your account, all resumes (their share links stop working immediately) and your roadmap. This cannot be undone.</p>
        {!confirming ? (
          <Button variant="danger" className="mt-3" onClick={() => setConfirming(true)}><TrashIcon className="h-4 w-4" /> Delete my account…</Button>
        ) : (
          <form onSubmit={deleteAccount} className="animate-fade-up mt-3 max-w-sm space-y-3">
            <Field label="Confirm with your password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={deleting || !password}>{deleting ? "Deleting…" : "Permanently delete"}</Button>
              <Button type="button" variant="secondary" onClick={() => { setConfirming(false); setPassword(""); }}>Cancel</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
