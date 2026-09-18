"use client";
import { type ReactNode, useEffect, useState } from "react";
import { formatBytes, getExtension } from "@/lib/filters";

export function Card({ children, className = "", title, subtitle, actions }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight title-grad">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export function Toggle({ on, onChange, label, help }: { on: boolean; onChange: (v: boolean) => void; label?: ReactNode; help?: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer py-1">
      <span>
        {label && <span className="text-sm font-medium">{label}</span>}
        {help && <span className="block text-xs text-faint">{help}</span>}
      </span>
      <button type="button" role="switch" aria-checked={on} className="toggle shrink-0" data-on={on} onClick={() => onChange(!on)}>
        <span />
      </button>
    </label>
  );
}

export function Progress({ value, active }: { value: number; active?: boolean }) {
  return (
    <div className="progress">
      <div className={active ? "active" : ""} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 fade-in">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl text-2xl" style={{ background: "rgba(109,124,255,.12)", color: "var(--accent)" }}>
        {icon}
      </div>
      <h4 className="text-base font-semibold">{title}</h4>
      {body && <p className="mt-1.5 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-2/3" />
            <div className="skeleton h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(5,8,18,.7)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className={`card w-full ${wide ? "max-w-3xl" : "max-w-lg"} p-6 fade-in`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = "Confirm", danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: string; confirmLabel?: string; danger?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button></>}>
      <p className="text-sm text-muted">{body}</p>
    </Modal>
  );
}

const EXT_ICON: Record<string, { glyph: string; color: string }> = {
  pdf: { glyph: "PDF", color: "#ff6b8a" }, doc: { glyph: "DOC", color: "#5ac8fa" }, docx: { glyph: "DOC", color: "#5ac8fa" },
  xls: { glyph: "XLS", color: "#3ddc97" }, xlsx: { glyph: "XLS", color: "#3ddc97" }, csv: { glyph: "CSV", color: "#3ddc97" },
  ppt: { glyph: "PPT", color: "#f5b544" }, pptx: { glyph: "PPT", color: "#f5b544" },
  zip: { glyph: "ZIP", color: "#a970ff" }, rar: { glyph: "RAR", color: "#a970ff" }, "7z": { glyph: "7Z", color: "#a970ff" }, tar: { glyph: "TAR", color: "#a970ff" }, gz: { glyph: "GZ", color: "#a970ff" },
  mp4: { glyph: "MP4", color: "#6d7cff" }, mkv: { glyph: "MKV", color: "#6d7cff" }, mov: { glyph: "MOV", color: "#6d7cff" }, avi: { glyph: "AVI", color: "#6d7cff" }, webm: { glyph: "WEB", color: "#6d7cff" },
  mp3: { glyph: "MP3", color: "#f5b544" }, flac: { glyph: "FLC", color: "#f5b544" }, m4a: { glyph: "M4A", color: "#f5b544" }, wav: { glyph: "WAV", color: "#f5b544" }, ogg: { glyph: "OGG", color: "#f5b544" },
  jpg: { glyph: "JPG", color: "#3ddc97" }, jpeg: { glyph: "JPG", color: "#3ddc97" }, png: { glyph: "PNG", color: "#3ddc97" }, gif: { glyph: "GIF", color: "#3ddc97" }, webp: { glyph: "WEBP", color: "#3ddc97" },
  epub: { glyph: "EPUB", color: "#ff6b8a" }, txt: { glyph: "TXT", color: "#8b93b3" }, apk: { glyph: "APK", color: "#3ddc97" }, exe: { glyph: "EXE", color: "#5ac8fa" }, iso: { glyph: "ISO", color: "#8b93b3" },
};

export function FileIcon({ name, size = 40 }: { name: string; size?: number }) {
  const ext = getExtension(name);
  const meta = EXT_ICON[ext] ?? { glyph: (ext || "FILE").toUpperCase().slice(0, 4), color: "#8b93b3" };
  return (
    <div className="grid shrink-0 place-items-center rounded-xl font-bold mono" style={{ width: size, height: size, fontSize: size * 0.24, color: meta.color, background: `${meta.color}1f`, border: `1px solid ${meta.color}33` }}>
      {meta.glyph}
    </div>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: string; accent?: string }) {
  return (
    <div className="card card-hover p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight" style={accent ? { color: accent } : undefined}>{value}</div>
      {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function timeAgo(d: string | Date | number, now = Date.now()): string {
  const t = typeof d === "number" ? d : new Date(d).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatEta(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

export { formatBytes };

/** Folder browser for the local machine (server side fs). */
export function FolderPicker({ open, onClose, initial, onPick }: { open: boolean; onClose: () => void; initial: string; onPick: (p: string) => void }) {
  const [cur, setCur] = useState<{ path: string; parent: string | null; entries: string[]; home: string; roots: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [typed, setTyped] = useState(initial);
  const load = async (p: string) => {
    setErr(null);
    const res = await fetch("/api/fs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list", path: p }) });
    const data = await res.json();
    if (!res.ok) return setErr(data.error ?? "Cannot open folder");
    setCur(data);
    setTyped(data.path);
  };
  useEffect(() => {
    if (open) void load(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Choose download folder" footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onPick(typed); onClose(); }}>Use this folder</button></>}>
      <div className="flex gap-2">
        <input className="input mono text-xs" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load(typed)} />
        <button className="btn btn-secondary" onClick={() => void load(typed)}>Go</button>
      </div>
      <div className="mt-2 flex gap-2 text-xs">
        {cur?.roots.map((r) => <button key={r} className="chip" onClick={() => void load(r)}>{r}</button>)}
        {cur && <button className="chip" onClick={() => void load(cur.home)}>Home</button>}
        {cur?.parent && <button className="chip" onClick={() => void load(cur.parent!)}>↑ Up</button>}
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-line divide-y divide-line">
        {cur?.entries.length === 0 && <p className="p-4 text-xs text-faint">No subfolders</p>}
        {cur?.entries.map((e) => (
          <button key={e} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-card-hover" onDoubleClick={() => void load(`${cur.path.replace(/[\\/]$/, "")}${cur.path.includes("\\") ? "\\" : "/"}${e}`)} onClick={() => setTyped(`${cur.path.replace(/[\\/]$/, "")}${cur.path.includes("\\") ? "\\" : "/"}${e}`)}>
            <span style={{ color: "var(--warning)" }}>▰</span> {e}
          </button>
        ))}
      </div>
      <p className="help">Single-click selects, double-click opens. Paths are on the machine running TeleFetch Studio.</p>
    </Modal>
  );
}
