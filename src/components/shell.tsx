"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { StoreProvider, useStore } from "./store";
import { timeAgo } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◧", key: "1" },
  { href: "/channels", label: "Channels", icon: "◎", key: "2" },
  { href: "/search", label: "Search & Filters", icon: "⌕", key: "3" },
  { href: "/queue", label: "Download Queue", icon: "⇣", key: "4" },
  { href: "/completed", label: "Completed", icon: "✓", key: "5" },
  { href: "/monitor", label: "Live Monitor", icon: "◉", key: "6" },
  { href: "/history", label: "History & Reports", icon: "▤", key: "7" },
  { href: "/settings", label: "Settings", icon: "⚙", key: "8" },
];

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <div className="grid place-items-center rounded-xl" style={{ width: size, height: size, background: "linear-gradient(135deg, var(--accent), var(--accent-2))", boxShadow: "0 8px 20px var(--accent-glow)" }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
      </svg>
    </div>
  );
}

function Sidebar() {
  const path = usePathname();
  const { state } = useStore();
  const conn = state?.connection;
  const stageColor = conn?.stage === "authorized" ? "var(--success)" : conn?.stage === "unconfigured" ? "var(--danger)" : "var(--warning)";
  const stageText = !conn ? "Connecting…" : conn.stage === "authorized" ? "Connected" : conn.stage === "unconfigured" ? "API not configured" : conn.stage === "disconnected" ? "Signed out" : "Signing in…";
  return (
    <aside className="hidden md:flex w-[248px] shrink-0 flex-col border-r border-line px-3 py-5" style={{ background: "color-mix(in srgb, var(--bg-elev) 80%, transparent)", backdropFilter: "blur(12px)" }}>
      <Link href="/" className="mb-6 flex items-center gap-3 px-2">
        <Logo />
        <div>
          <div className="text-[15px] font-semibold tracking-tight leading-none">TeleFetch <span className="title-grad">Studio</span></div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-faint">Channel downloader</div>
        </div>
      </Link>
      <nav className="flex flex-col gap-1 px-1.5">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          const count = n.href === "/queue" ? (state?.stats.queued ?? 0) + (state?.stats.downloading ?? 0) : n.href === "/monitor" && state?.monitor.status === "running" ? -1 : 0;
          return (
            <Link key={n.href} href={n.href} className={`nav-item ${active ? "active" : ""}`}>
              <span className="w-5 text-center text-base opacity-90">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {count > 0 && <span className="rounded-full px-2 text-[11px] font-semibold" style={{ background: "rgba(109,124,255,.2)", color: "var(--accent)" }}>{count}</span>}
              {count === -1 && <span className="dot dot-live" style={{ color: "var(--success)", background: "var(--success)" }} />}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 px-1.5">
        <div className="card p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className={`dot ${conn?.stage === "authorized" ? "dot-live" : ""}`} style={{ background: stageColor, color: stageColor }} />
            <span className="font-medium">{stageText}</span>
          </div>
          {conn?.user && <div className="mt-1 truncate text-xs text-muted">{conn.user.name}{conn.user.username ? ` · @${conn.user.username}` : ""}</div>}
          {!conn?.user && <div className="mt-1 text-xs text-faint">{conn?.stage === "unconfigured" ? "Set TELEGRAM_API_ID / HASH" : "Sign in from Settings"}</div>}
        </div>
        <p className="px-1 text-[10px] leading-relaxed text-faint">Only channels your own account can access are visible. TeleFetch never bypasses Telegram permissions.</p>
      </div>
    </aside>
  );
}

function TopBar() {
  const { state, error, toasts } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const mon = state?.monitor.status;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); document.getElementById("global-search")?.focus(); }
      if (e.altKey && /^[1-8]$/.test(e.key)) { e.preventDefault(); router.push(NAV[Number(e.key) - 1].href); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [router]);
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line px-4 md:px-6" style={{ background: "color-mix(in srgb, var(--bg) 78%, transparent)", backdropFilter: "blur(14px)" }}>
      <Link href="/" className="md:hidden"><Logo size={30} /></Link>
      <form className="relative flex-1 max-w-xl" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/completed?q=${encodeURIComponent(q.trim())}`); }}>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">⌕</span>
        <input id="global-search" className="input pl-9 pr-16" placeholder="Search downloads, channels, files…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex gap-1"><kbd>Ctrl</kbd><kbd>K</kbd></span>
      </form>
      <div className="ml-auto flex items-center gap-2">
        {error && <span className="badge badge-failed" title={error}>offline</span>}
        <span className="badge" style={{ background: state?.connection.stage === "authorized" ? "rgba(61,220,151,.12)" : "rgba(245,181,68,.12)", color: state?.connection.stage === "authorized" ? "var(--success)" : "var(--warning)" }}>
          <span className={`dot ${state?.connection.stage === "authorized" ? "dot-live" : ""}`} style={{ background: "currentColor", color: "currentColor" }} />
          {state?.connection.stage === "authorized" ? "Telegram" : "Offline"}
        </span>
        <Link href="/monitor" className="badge" style={{ background: mon === "running" ? "rgba(109,124,255,.14)" : "rgba(139,147,179,.12)", color: mon === "running" ? "var(--accent)" : "var(--text-muted)" }}>
          <span className={`dot ${mon === "running" ? "dot-live" : ""}`} style={{ background: "currentColor", color: "currentColor" }} />
          {mon === "running" ? "Monitoring" : mon === "paused" ? "Mon. paused" : "Monitor off"}
        </Link>
        <div className="relative">
          <button className="btn btn-ghost btn-icon relative" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
            <span>🔔</span>
            {toasts.length > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />}
          </button>
          {open && (
            <div className="card absolute right-0 top-11 w-80 p-3 fade-in" onMouseLeave={() => setOpen(false)}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recent activity</div>
              <div className="max-h-80 space-y-2 overflow-auto">
                {state?.activity.slice(0, 12).map((a) => (
                  <div key={a.id} className="text-xs">
                    <span className="mr-1.5" style={{ color: `var(--${a.level === "info" ? "info" : a.level})` }}>●</span>
                    <span className="text-ink">{a.message}</span>
                    <span className="ml-1 text-faint">{timeAgo(a.createdAt, state.now)}</span>
                  </div>
                ))}
                {!state?.activity.length && <p className="text-xs text-faint">No activity yet.</p>}
              </div>
            </div>
          )}
        </div>
        <Link href="/settings" className="flex h-9 items-center gap-2 rounded-xl border border-line-strong px-2 hover:bg-card-hover">
          <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}>{(state?.connection.user?.name ?? "?").slice(0, 1).toUpperCase()}</span>
          <span className="hidden text-xs font-medium lg:inline">{state?.connection.user?.name ?? "Account"}</span>
        </Link>
      </div>
    </header>
  );
}

function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="card pointer-events-auto flex items-start gap-3 p-3 fade-in" style={{ borderColor: `color-mix(in srgb, var(--${t.level === "info" ? "info" : t.level}) 40%, transparent)` }}>
          <span className="mt-0.5" style={{ color: `var(--${t.level === "info" ? "info" : t.level})` }}>●</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t.title}</div>
            {t.body && <div className="truncate text-xs text-muted" title={t.body}>{t.body}</div>}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={() => dismiss(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

function MobileNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex justify-around border-t border-line px-2 py-2 md:hidden" style={{ background: "var(--bg-elev)" }}>
      {NAV.slice(0, 6).map((n) => (
        <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 text-[10px] ${path === n.href ? "text-accent" : "text-muted"}`}>
          <span className="text-base">{n.icon}</span>
          {n.label.split(" ")[0]}
        </Link>
      ))}
    </nav>
  );
}

function ThemeSync({ children }: { children: ReactNode }) {
  const { state } = useStore();
  useEffect(() => {
    document.documentElement.dataset.theme = state?.settings.theme ?? "dark";
  }, [state?.settings.theme]);
  return <>{children}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <ThemeSync>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8 max-w-[1500px] w-full mx-auto">{children}</main>
          </div>
        </div>
        <Toasts />
        <MobileNav />
      </ThemeSync>
    </StoreProvider>
  );
}
