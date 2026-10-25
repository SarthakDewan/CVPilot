import { useEffect, useState } from "react";

const R = 54;
const C = 2 * Math.PI * R;

export function bandFor(score: number): { label: string; color: string; text: string } {
  if (score >= 75) return { label: "Strong overlap", color: "#059669", text: "text-emerald-700" };
  if (score >= 55) return { label: "Moderate overlap", color: "#d97706", text: "text-amber-700" };
  return { label: "Weak overlap", color: "#e11d48", text: "text-rose-700" };
}

/** Circular gauge that animates from 0 to the score. The number is also in text for screen readers. */
export function ScoreRing({ score }: { score: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(id);
  }, [score]);
  const band = bandFor(score);
  return (
    <div className="relative h-40 w-40" role="img" aria-label={`Match score ${score} out of 100, ${band.label}`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={R} fill="none" stroke={band.color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - shown / 100)} style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><div className={`text-4xl font-extrabold ${band.text}`}>{score}</div><div className="text-xs text-slate-500">out of 100</div></div>
      </div>
    </div>
  );
}
