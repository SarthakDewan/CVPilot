import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Logo } from "../components/icons";
import { ResumePreview, ScaledPage } from "../components/ResumePreview";
import { api, ApiError } from "../lib/api";
import type { ResumeContent, TemplateId } from "../lib/types";

export default function PublicResume() {
  const { token = "" } = useParams();
  const [data, setData] = useState<{ title: string; templateId: TemplateId; content: ResumeContent } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ resume: NonNullable<typeof data> }>(`/public/resumes/${encodeURIComponent(token)}`)
      .then((r) => { setData(r.resume); document.title = `${r.resume.content.basics.fullName || "Resume"} – CVPilot`; })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this resume"));
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-6">
      <div className="mx-auto max-w-[820px]">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-600">
          <Logo className="text-brand-900" /><span>Read-only shared resume</span>
        </div>
        {error && <p role="alert" className="rounded-xl bg-white p-10 text-center text-slate-700 shadow">{error}</p>}
        {!error && !data && <div className="skeleton h-[600px]" aria-busy="true" />}
        {data && <div className="animate-fade-up"><ScaledPage><ResumePreview content={data.content} templateId={data.templateId} /></ScaledPage></div>}
      </div>
    </div>
  );
}
