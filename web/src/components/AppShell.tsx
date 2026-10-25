import { useState, type ComponentType } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { BriefcaseIcon, ChartIcon, CloseIcon, CogIcon, FileIcon, HomeIcon, LogoutIcon, Logo, MapIcon, MenuIcon, ShieldIcon, TargetIcon } from "./icons";

interface NavItem { to: string; label: string; icon: ComponentType<{ className?: string }>; phase?: number }
const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: HomeIcon },
  { to: "/resumes", label: "Resumes", icon: FileIcon },
  { to: "/ats", label: "ATS Score", icon: TargetIcon },
  { to: "/jobs", label: "Job Matches", icon: BriefcaseIcon, phase: 4 },
  { to: "/scam-radar", label: "Scam Radar", icon: ShieldIcon, phase: 4 },
  { to: "/insights", label: "Market Insights", icon: ChartIcon, phase: 6 },
  { to: "/roadmap", label: "Skill Roadmap", icon: MapIcon, phase: 6 },
  { to: "/settings", label: "Settings", icon: CogIcon, phase: 6 },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav aria-label="Main" className="flex-1 space-y-1 px-3">
      {NAV.map(({ to, label, icon: Icon, phase }) =>
        phase ? (
          <div key={to} className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500" aria-disabled="true" title={`Coming in phase ${phase}`}>
            <Icon className="opacity-60" />
            <span className="flex-1">{label}</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Soon</span>
          </div>
        ) : (
          <NavLink
            key={to} to={to} end={to === "/"} onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-brand-600 text-white shadow" : "text-slate-300 hover:bg-white/10 hover:text-white"}`
            }
          >
            <Icon className="transition group-hover:scale-110" />
            {label}
          </NavLink>
        ),
      )}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-900 py-5 text-white">
      <div className="px-5 pb-6"><Logo className="text-lg" /></div>
      {nav}
      <div className="mx-3 mt-4 rounded-lg bg-white/5 p-3">
        <p className="truncate text-xs text-slate-400">Signed in as</p>
        <p className="truncate text-sm font-medium">{user?.email}</p>
        <button onClick={() => void logout()} className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-300 transition hover:text-white">
          <LogoutIcon className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="hidden w-64 shrink-0 lg:block"><div className="fixed inset-y-0 w-64">{sidebar}</div></aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo className="text-lg text-brand-900" />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 hover:bg-slate-100"><MenuIcon /></button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="animate-fade-up absolute inset-y-0 left-0 w-64 shadow-2xl">
            {sidebar}
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-2 top-3 rounded-lg p-2 text-white hover:bg-white/10"><CloseIcon /></button>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1"><Outlet /></main>
    </div>
  );
}
