import { CheckIcon } from "./icons";
import type { ScamBand, Screening } from "../lib/types";

export const BAND: Record<ScamBand, { label: string; chip: string; bar: string; ring: string }> = {
  safe: { label: "Low risk", chip: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500", ring: "border-emerald-200" },
  caution: { label: "Caution", chip: "bg-amber-100 text-amber-800", bar: "bg-amber-500", ring: "border-amber-300" },
  high: { label: "High risk", chip: "bg-rose-100 text-rose-800", bar: "bg-rose-600", ring: "border-rose-300" },
};

export function ScamBadge({ band }: { band: ScamBand }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${BAND[band].chip}`}>{BAND[band].label}</span>;
}

export function ModeNote({ mode }: { mode: "hybrid" | "rule-only" }) {
  return mode === "rule-only" ? (
    <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
      <strong>Rule-only mode.</strong> The trained scam classifier is not installed, so the risk score comes only from the rule indicators (w<sub>r</sub>=1, w<sub>c</sub>=0).
    </p>
  ) : (
    <p className="rounded-lg bg-brand-50 p-3 text-xs text-brand-900"><strong>Hybrid mode.</strong> Risk combines the rule indicators with a trained text classifier.</p>
  );
}

/** Evidence behind a risk band: score meter with band thresholds, fired indicators with quotes, and passed checks. */
export function ScamDetail({ s }: { s: Screening }) {
  const pct = Math.min(100, Math.round(s.risk * 100));
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="flex items-baseline justify-between"><span className="font-semibold">Risk score {s.risk.toFixed(2)}</span><span className="text-xs text-slate-500">rules fired {s.fired.length}/{s.checked.length}{s.p_clf !== null && ` · classifier ${s.p_clf.toFixed(2)}`}</span></div>
        <div className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Risk score">
          <div className={`h-full rounded-full transition-all duration-700 ${BAND[s.band].bar}`} style={{ width: `${Math.max(pct, 2)}%` }} />
          <span className="absolute inset-y-0 left-1/4 w-px bg-white/80" /><span className="absolute inset-y-0 left-1/2 w-px bg-white/80" />
        </div>
        <div className="mt-0.5 flex text-[10px] text-slate-400"><span className="w-1/4">low</span><span className="w-1/4">caution</span><span className="flex-1">high</span></div>
      </div>

      {s.fired.length > 0 ? (
        <ul className="space-y-2">
          {s.fired.map((f) => (
            <li key={f.id} className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="font-semibold text-rose-900">{f.name}</p>
              <p className="mt-0.5 text-rose-800">{f.reason}</p>
              <p className="mt-1 text-xs text-rose-700">Found in text: <q className="font-mono">{f.evidence}</q></p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">None of the rule indicators matched. That lowers the risk but is not a guarantee: always verify the employer yourself.</p>
      )}

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500" aria-label="Rules checked">
        {s.checked.filter((c) => !c.fired).map((c) => <li key={c.id} className="inline-flex items-center gap-1"><CheckIcon className="h-3.5 w-3.5 text-emerald-600" />{c.name}: not found</li>)}
      </ul>
    </div>
  );
}

export const SCAM_DISCLAIMER = "Automated checks are heuristics: they can miss scams and flag legitimate listings. Never pay to get a job or share bank details, OTPs or card numbers with a recruiter.";
