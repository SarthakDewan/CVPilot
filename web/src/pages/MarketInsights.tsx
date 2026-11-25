import { useState, type FormEvent } from "react";
import { Badge, Button, Card, Field, Skeleton } from "../components/ui";
import { api, ApiError } from "../lib/api";
import type { Insight } from "../lib/types";
import { timeAgo } from "../lib/time";
import { useProfileDefaults } from "../lib/useDefaults";

const money = (n: number, cur: string) => {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format(n); } catch { return String(Math.round(n)); }
};

export default function MarketInsights() {
  const defaults = useProfileDefaults();
  const [roleEdit, setRole] = useState<string | null>(null); // null = untouched, show the profile default
  const [locationEdit, setLocation] = useState<string | null>(null);
  const role = roleEdit ?? defaults.role;
  const location = locationEdit ?? defaults.location;
  const [data, setData] = useState<Insight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ insight: Insight }>("/insights/refresh", { method: "POST", body: { role, location } });
      setData(r.insight);
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : "Could not load insights");
    } finally {
      setBusy(false);
    }
  }

  const top = data?.skills.slice(0, 15) ?? [];
  const max = top[0]?.count ?? 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-extrabold">Market Insights</h1>
      <p className="mt-1 text-sm text-slate-600">See which skills employers ask for and what the role pays, based on live listings.</p>

      <Card className="mt-6 p-5">
        <form onSubmit={run} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Role" value={role} onChange={(e) => setRole(e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. Data Analyst" />
          <Field label="Location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="optional" />
          <Button type="submit" disabled={busy || role.trim().length < 2}>{busy ? "Fetching…" : "Get insights"}</Button>
        </form>
        <p className="mt-3 text-xs text-slate-500">Data comes from Adzuna and is cached for a few minutes per role and location.</p>
      </Card>

      {busy && <div className="mt-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>}
      {error && <p role="alert" className="animate-fade-up mt-6 rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}

      {data && !busy && (
        <section className="animate-fade-up mt-6 space-y-4" aria-label="Insights">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm [&_strong:not(:first-child)]:capitalize"><strong>{data.listingCount}</strong> listings sampled for <strong>{data.role}</strong>{data.location && <> in <strong>{data.location}</strong></>}</p>
            <span className="text-xs text-slate-500">Updated {timeAgo(data.updatedAt)}</span>
          </Card>

          <Card className="p-5">
            <h2 className="font-bold">Salary</h2>
            {data.salary ? (
              <>
                <p className="mt-2 text-3xl font-extrabold text-brand-900">{money(data.salary.median, data.salary.currency)} <span className="text-sm font-medium text-slate-500">median per year</span></p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {([["Lowest", data.salary.min], ["25th percentile", data.salary.p25], ["75th percentile", data.salary.p75], ["Highest", data.salary.max]] as const).map(([k, v]) => (
                    <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold">{money(v, data.salary!.currency)}</dd></div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-slate-500">
                  Based on {data.salary.count} of {data.listingCount} listings that include a salary (midpoint of each range)
                  {data.salaryPredictedShare !== null && data.salaryPredictedShare > 0 && <> · <strong>{Math.round(data.salaryPredictedShare * 100)}%</strong> of these are estimated by Adzuna rather than stated by the employer</>}.
                </p>
              </>
            ) : <p className="mt-2 text-sm text-slate-600">None of the sampled listings include a salary.</p>}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between"><h2 className="font-bold">Most requested skills</h2><Badge tone="indigo">{data.skills.length} skills found</Badge></div>
            {top.length === 0 ? <p className="mt-3 text-sm text-slate-600">No known skills were found in these listings (Adzuna only returns a short description snippet).</p> : (
              <ol className="mt-4 space-y-2.5">
                {top.map((s, i) => (
                  <li key={s.skill} className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-3 text-sm">
                    <span className="truncate font-medium" title={s.skill}>{s.skill}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all duration-700" style={{ width: `${(100 * s.count) / max}%`, transitionDelay: `${i * 30}ms` }} />
                    </div>
                    <span className="text-right text-xs text-slate-600">{s.count}/{data.listingCount} · {Math.round(s.demand * 100)}%</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-4 text-xs text-slate-500">Demand = share of sampled listings that mention the skill. Skills come from a curated list, matched in each listing’s description snippet.</p>
          </Card>
        </section>
      )}
    </div>
  );
}
