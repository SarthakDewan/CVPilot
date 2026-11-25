import { useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { PlusIcon, SparkIcon, TrashIcon } from "./icons";
import { Button } from "./ui";

/** AI phrasing help for one snippet. Only this text is sent (via the gateway) to the LLM provider. */
export function SuggestButton({ kind, text, onPick }: { kind: "bullet" | "summary"; text: string; onPick(v: string): void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const tooShort = text.trim().length < 10;

  async function run() {
    setBusy(true);
    try {
      const r = await api<{ suggestions: string[] }>("/resumes/suggest", { method: "POST", body: { kind, text } });
      setOptions(r.suggestions);
      if (r.suggestions.length === 0) toast("No suggestions returned", "info");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Suggestion failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button" onClick={() => void run()} disabled={busy || tooShort}
        title={tooShort ? "Write at least 10 characters first" : "Suggest alternative phrasing (sends this text to Google Gemini)"}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-40"
      >
        <SparkIcon className="h-4 w-4" /> {busy ? "Thinking…" : "Improve wording"}
      </button>
      {options.length > 0 && (
        <ul className="animate-fade-up mt-1 space-y-1 rounded-lg border border-brand-100 bg-brand-50/60 p-2">
          {options.map((o, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="flex-1">{o}</span>
              <button type="button" className="shrink-0 rounded bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-brand-700" onClick={() => { onPick(o); setOptions([]); }}>Use</button>
            </li>
          ))}
          <li><button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setOptions([])}>Dismiss</button></li>
        </ul>
      )}
    </div>
  );
}

export function Bullets({ items, onChange, label = "Bullets", ai = true }: { items: string[]; onChange(v: string[]): void; label?: string; ai?: boolean }) {
  const set = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <ul className="mt-1 space-y-2">
        {items.map((b, i) => (
          <li key={i}>
            <div className="flex gap-2">
              <textarea
                aria-label={`${label} ${i + 1}`} rows={2} value={b} maxLength={400} onChange={(e) => set(i, e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <button type="button" aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))} className="h-9 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><TrashIcon className="h-4 w-4" /></button>
            </div>
            {ai && <SuggestButton kind="bullet" text={b} onPick={(v) => set(i, v)} />}
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" className="mt-1 !px-2 !py-1 text-xs" onClick={() => onChange([...items, ""])}><PlusIcon className="h-4 w-4" /> Add</Button>
    </div>
  );
}

export function TagInput({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange(v: string[]): void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...items, ...parts])].slice(0, 80));
    setDraft("");
  };
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={`tag-${label}`}>{label}</label>
      <div className="mt-1 flex flex-wrap gap-1.5 rounded-lg border border-slate-300 bg-white p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">
        {items.map((t) => (
          <span key={t} className="animate-fade-up inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(items.filter((x) => x !== t))} className="text-brand-500 hover:text-rose-600">×</button>
          </span>
        ))}
        <input
          id={`tag-${label}`} value={draft} placeholder={items.length ? "" : placeholder}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); } else if (e.key === "Backspace" && !draft && items.length) onChange(items.slice(0, -1)); }}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">Press Enter or comma to add.</p>
    </div>
  );
}

export function Repeater<T>({ title, items, onChange, blank, render, summary, addLabel }: {
  title: string; items: T[]; onChange(v: T[]): void; blank: () => T; addLabel: string;
  summary(item: T): string; render(item: T, set: (patch: Partial<T>) => void): ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(items.length ? 0 : null);
  return (
    <div className="space-y-2">
      {items.map((it, i) => {
        const isOpen = open === i;
        const set = (patch: Partial<T>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <div key={i} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)} className="flex-1 truncate text-left text-sm font-semibold">
                {summary(it) || `${title} ${i + 1}`}
              </button>
              <button type="button" aria-label={`Remove ${title} ${i + 1}`} onClick={() => { onChange(items.filter((_, j) => j !== i)); setOpen(null); }} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><TrashIcon className="h-4 w-4" /></button>
            </div>
            {isOpen && <div className="animate-fade-up space-y-3 p-3">{render(it, set)}</div>}
          </div>
        );
      })}
      <Button type="button" variant="secondary" onClick={() => { onChange([...items, blank()]); setOpen(items.length); }}><PlusIcon className="h-4 w-4" /> {addLabel}</Button>
    </div>
  );
}
