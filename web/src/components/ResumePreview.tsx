import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { range, type ResumeContent, type TemplateId } from "../lib/types";

interface Style { font: string; accent: string; center: boolean; upper: boolean; rule: boolean; base: number; name: number }
const STYLES: Record<TemplateId, Style> = {
  classic: { font: "Georgia, 'Times New Roman', serif", accent: "#111111", center: true, upper: true, rule: true, base: 13.5, name: 30 },
  modern: { font: "Inter, system-ui, sans-serif", accent: "#1d4ed8", center: false, upper: false, rule: true, base: 13, name: 32 },
  compact: { font: "Inter, system-ui, sans-serif", accent: "#0f766e", center: false, upper: true, rule: false, base: 11.5, name: 24 },
};
export const ACCENTS: Record<TemplateId, string> = { classic: "#111111", modern: "#1d4ed8", compact: "#0f766e" };

const PAGE_W = 794; // A4 at 96dpi

/** Renders children at A4 width and scales them to fit the container. */
export function ScaledPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / PAGE_W));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(Math.max(1123, el.scrollHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className={`w-full ${className}`} style={{ height: height * scale }}>
      <div ref={inner} className="print-area origin-top-left bg-white shadow-xl ring-1 ring-slate-200" style={{ width: PAGE_W, minHeight: 1123, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

type S = Style;
function Section({ s, compact, title, children }: { s: S; compact: boolean; title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: compact ? 12 : 18 }}>
      <h2 style={{ color: s.accent, fontSize: s.base + 1.5, fontWeight: 700, textTransform: s.upper ? "uppercase" : "none", letterSpacing: s.upper ? "0.06em" : 0, borderBottom: s.rule ? `1.5px solid ${s.accent}` : "none", paddingBottom: 2, marginBottom: 6 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ s, left, right, sub }: { s: S; left: string; right?: string; sub?: string }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontWeight: 700 }}>
        <span>{left}</span>
        {right && <span style={{ fontWeight: 400, color: "#555", fontSize: s.base - 1 }}>{right}</span>}
      </div>
      {sub && <div style={{ fontStyle: "italic", color: "#555", fontSize: s.base - 1 }}>{sub}</div>}
    </>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: "disc", paddingLeft: 18, marginTop: 2 }}>
      {items.filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
}

export function ResumePreview({ content: c, templateId }: { content: ResumeContent; templateId: TemplateId }) {
  const s = STYLES[templateId];
  const b = c.basics;
  const contact = [b.email, b.phone, b.location, ...b.links.map((l) => l.url || l.label)].filter(Boolean);
  const pad = templateId === "compact" ? 36 : 48;
  const root: CSSProperties = { fontFamily: s.font, fontSize: s.base, color: "#222", padding: pad, lineHeight: 1.45 };
  const align = s.center ? "center" : "left";

  return (
    <div style={root}>
      <header style={{ textAlign: align }}>
        <h1 style={{ fontSize: s.name, fontWeight: 800, color: s.accent, lineHeight: 1.1 }}>{b.fullName || "Your Name"}</h1>
        {b.headline && <div style={{ fontSize: s.base + 1.5, marginTop: 2 }}>{b.headline}</div>}
        {contact.length > 0 && <div style={{ color: "#555", fontSize: s.base - 1, marginTop: 4 }}>{contact.join("  |  ")}</div>}
      </header>

      {c.summary && <Section s={s} compact={templateId === "compact"} title="Summary"><p>{c.summary}</p></Section>}
      {c.skills.length > 0 && <Section s={s} compact={templateId === "compact"} title="Skills"><p>{c.skills.join(", ")}</p></Section>}
      {c.experience.length > 0 && (
        <Section s={s} compact={templateId === "compact"} title="Experience">
          {c.experience.map((e, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <Row s={s} left={[e.role, e.company].filter(Boolean).join(", ")} right={range(e.start, e.end, e.current)} sub={e.location} />
              <Bullets items={e.bullets} />
            </div>
          ))}
        </Section>
      )}
      {c.projects.length > 0 && (
        <Section s={s} compact={templateId === "compact"} title="Projects">
          {c.projects.map((p, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <Row s={s} left={p.name} right={p.link} sub={p.tech.join(", ")} />
              {p.description && <p>{p.description}</p>}
              <Bullets items={p.bullets} />
            </div>
          ))}
        </Section>
      )}
      {c.education.length > 0 && (
        <Section s={s} compact={templateId === "compact"} title="Education">
          {c.education.map((e, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <Row s={s} left={[e.degree, e.field].filter(Boolean).join(", ") || e.institution} right={range(e.start, e.end)} sub={[e.degree || e.field ? e.institution : "", e.grade].filter(Boolean).join("  |  ")} />
            </div>
          ))}
        </Section>
      )}
      {c.achievements.length > 0 && <Section s={s} compact={templateId === "compact"} title="Achievements"><Bullets items={c.achievements} /></Section>}
      {c.certifications.length > 0 && (
        <Section s={s} compact={templateId === "compact"} title="Certifications">
          {c.certifications.map((x, i) => <Row s={s} key={i} left={x.name} right={x.year} sub={x.issuer} />)}
        </Section>
      )}
    </div>
  );
}
