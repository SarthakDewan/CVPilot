import { useState } from "react";
import { ModeNote, SCAM_DISCLAIMER, ScamBadge, ScamDetail, BAND } from "../components/ScamUI";
import { Button, Card } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import type { Screening } from "../lib/types";

export default function ScamRadar() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Screening | null>(null);

  async function check() {
    setBusy(true);
    try {
      const r = await api<{ screening: Screening }>("/jobs/screen", { method: "POST", body: { text } });
      setResult(r.screening);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Check failed", "error");
    } finally {
      setBusy(false);
    }
  }
  const ok = text.trim().length >= 20 && !busy;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-extrabold">Scam Radar</h1>
      <p className="mt-1 text-sm text-slate-600">Paste any job listing, recruiter message or offer text and see which scam indicators it triggers.</p>

      <Card className="mt-6 space-y-3 p-5">
        <label htmlFor="listing" className="block text-sm font-medium text-slate-700">Listing text</label>
        <textarea id="listing" rows={10} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the job posting or message here…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        <div className="flex items-center justify-between">
          <Button onClick={() => void check()} disabled={!ok}>{busy ? "Checking…" : "Check listing"}</Button>
          <span className="text-xs text-slate-500">{text.length}/20000</span>
        </div>
        <p className="text-xs text-slate-500">Checked by CVPilot’s own service; this text is not sent to any third-party LLM.</p>
      </Card>

      {result && (
        <section className="animate-fade-up mt-6 space-y-4" aria-label="Scam check result">
          <Card className={`border-2 p-5 ${BAND[result.band].ring}`}>
            <div className="flex items-center gap-3"><ScamBadge band={result.band} /><h2 className="font-bold">{result.fired.length ? `${result.fired.length} indicator${result.fired.length > 1 ? "s" : ""} found` : "No indicators found"}</h2></div>
            <div className="mt-4"><ScamDetail s={result} /></div>
          </Card>
          <ModeNote mode={result.mode} />
          <p className="text-xs text-slate-500">{SCAM_DISCLAIMER}</p>
        </section>
      )}
    </div>
  );
}
