"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Card, EmptyState, FileIcon, PageHeader, Progress, formatBytes, Modal } from "@/components/ui";
import { DestinationSelector, DestinationConfirmDialog } from "@/components/destination";
import { DEFAULT_FILTER, KNOWN_EXTENSIONS, parseKeywords, normalizeExtension, type FilterConfig } from "@/lib/filters";
import type { ScanState, ScanResultItem } from "@/lib/telegram/scanner";
import type { FilterProfile, Channel } from "@/db";

const MB = 1024 * 1024;

export default function SearchPage() {
  const { state, api, toast } = useStore();
  const [f, setF] = useState<FilterConfig>(DEFAULT_FILTER);
  const [inc, setInc] = useState("");
  const [exc, setExc] = useState("");
  const [customExt, setCustomExt] = useState("");
  const [minMb, setMinMb] = useState("");
  const [maxMb, setMaxMb] = useState("");
  const [loadedFromSettings, setLoaded] = useState(false);
  const [scan, setScan] = useState<ScanState | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<FilterProfile[]>([]);
  const [profileName, setProfileName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirmDest, setConfirmDest] = useState(false);
  const [busy, setBusy] = useState(false);

  // Load active filter from settings once
  useEffect(() => {
    if (!state || loadedFromSettings) return;
    const af = state.settings.activeFilter;
    setF(af);
    setInc(af.includeKeywords.join(", "));
    setExc(af.excludeKeywords.join(", "));
    setMinMb(af.minSizeBytes ? String(af.minSizeBytes / MB) : "");
    setMaxMb(af.maxSizeBytes ? String(af.maxSizeBytes / MB) : "");
    setLoaded(true);
  }, [state, loadedFromSettings]);

  useEffect(() => {
    fetch("/api/profiles").then((r) => r.json()).then(setProfiles).catch(() => {});
  }, []);

  // Poll scan state while running or when results exist
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await fetch("/api/scan", { cache: "no-store" });
      if (alive && r.ok) setScan(await r.json());
    };
    void load();
    const t = setInterval(() => void load(), 1200);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const filter = useMemo<FilterConfig>(() => ({
    ...f,
    includeKeywords: parseKeywords(inc),
    excludeKeywords: parseKeywords(exc),
    minSizeBytes: minMb ? Math.round(Number(minMb) * MB) : null,
    maxSizeBytes: maxMb ? Math.round(Number(maxMb) * MB) : null,
  }), [f, inc, exc, minMb, maxMb]);

  const selected = state?.channels.filter((c) => c.selected) ?? [];
  const base = state?.settings.destinationDir ?? "";
  const sep = base.includes("\\") ? "\\" : "/";
  const previewFolders = filter.includeKeywords.length ? filter.includeKeywords : [state?.settings.fallbackFolder ?? "Telegram_Downloads"];

  const startScan = async () => {
    if (!state?.settings.destinationConfirmed) return setConfirmDest(true);
    setBusy(true);
    try {
      setPicked(new Set());
      const s = await api<ScanState>("/api/scan", { action: "start", channelIds: selected.map((c) => c.id), filter });
      setScan(s);
    } catch (e) {
      toast({ title: "Cannot start scan", body: e instanceof Error ? e.message : String(e), level: "error" });
    } finally {
      setBusy(false);
    }
  };
  const enqueue = async (keys: string[]) => {
    setBusy(true);
    try {
      const r = await api<{ added: number; skipped: number }>("/api/scan", { action: "enqueue", keys });
      toast({ title: `${r.added} file(s) queued`, body: r.skipped ? `${r.skipped} duplicate(s) skipped` : "Downloads start automatically", level: "success" });
      setPicked(new Set());
    } catch (e) {
      toast({ title: "Enqueue failed", body: e instanceof Error ? e.message : String(e), level: "error" });
    } finally {
      setBusy(false);
    }
  };
  const toggleExt = (e: string) => setF((p) => ({ ...p, extensions: p.extensions.includes(e) ? p.extensions.filter((x) => x !== e) : [...p.extensions, e] }));
  const results: ScanResultItem[] = scan?.results ?? [];
  const pending = results.filter((r) => !r.queued && !r.alreadyDownloaded);
  const key = (r: ScanResultItem) => `${r.channelTelegramId}:${r.messageId}`;
  const pct = scan?.totalEstimate ? Math.min(99, (scan.messagesExamined / scan.totalEstimate) * 100) : 0;

  const saveProfile = async () => {
    const p = await api<FilterProfile>("/api/profiles", { name: profileName, config: filter });
    setProfiles((ps) => [...ps, p]);
    setSaveOpen(false);
    setProfileName("");
  };
  const loadProfile = (p: FilterProfile) => {
    const c = { ...DEFAULT_FILTER, ...(p.config as FilterConfig) };
    setF(c);
    setInc(c.includeKeywords.join(", "));
    setExc(c.excludeKeywords.join(", "));
    setMinMb(c.minSizeBytes ? String(c.minSizeBytes / MB) : "");
    setMaxMb(c.maxSizeBytes ? String(c.maxSizeBytes / MB) : "");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Search & Filters" subtitle="Describe what you are looking for. Matching files are previewed before anything is downloaded." actions={
        <>
          {profiles.length > 0 && (
            <select className="input w-48" defaultValue="" onChange={(e) => { const p = profiles.find((x) => x.id === Number(e.target.value)); if (p) loadProfile(p); e.target.value = ""; }}>
              <option value="" disabled>Load profile…</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button className="btn btn-secondary" onClick={() => setSaveOpen(true)}>Save profile</button>
          <button className="btn btn-primary" onClick={() => void startScan()} disabled={busy || scan?.running || selected.length === 0 || state?.connection.stage !== "authorized"}>
            {scan?.running ? "Scanning…" : `Scan ${selected.length} channel${selected.length === 1 ? "" : "s"}`}
          </button>
        </>
      } />

      <div className="grid gap-5 xl:grid-cols-5">
        <div className="space-y-5 xl:col-span-2">
          <Card title="Keywords" subtitle="Comma-separated. Case-insensitive.">
            <label className="label">Include</label>
            <input className="input" placeholder="python, machine learning, pdf course" value={inc} onChange={(e) => setInc(e.target.value)} />
            <label className="label mt-4">Exclude</label>
            <input className="input" placeholder="trailer, sample" value={exc} onChange={(e) => setExc(e.target.value)} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Match rule</label>
                <div className="flex gap-2">
                  <button className={`chip ${filter.matchMode === "any" ? "chip-on" : ""}`} onClick={() => setF((p) => ({ ...p, matchMode: "any" }))}>ANY keyword</button>
                  <button className={`chip ${filter.matchMode === "all" ? "chip-on" : ""}`} onClick={() => setF((p) => ({ ...p, matchMode: "all" }))}>ALL keywords</button>
                </div>
              </div>
              <div>
                <label className="label">Match in</label>
                <div className="flex gap-2">
                  <button className={`chip ${filter.matchFilename ? "chip-on" : ""}`} onClick={() => setF((p) => ({ ...p, matchFilename: !p.matchFilename }))}>Filename</button>
                  <button className={`chip ${filter.matchCaption ? "chip-on" : ""}`} onClick={() => setF((p) => ({ ...p, matchCaption: !p.matchCaption }))}>Caption</button>
                </div>
              </div>
            </div>
          </Card>

          <Card title="File types" subtitle="Leave empty to include every media & document">
            <div className="space-y-3">
              {KNOWN_EXTENSIONS.map((g) => (
                <div key={g.group}>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">{g.group}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((e) => <button key={e} className={`chip ${filter.extensions.includes(e) ? "chip-on" : ""}`} onClick={() => toggleExt(e)}>.{e}</button>)}
                  </div>
                </div>
              ))}
              {filter.extensions.filter((e) => !KNOWN_EXTENSIONS.some((g) => g.items.includes(e))).length > 0 && (
                <div className="flex flex-wrap gap-1.5">{filter.extensions.filter((e) => !KNOWN_EXTENSIONS.some((g) => g.items.includes(e))).map((e) => <button key={e} className="chip chip-on" onClick={() => toggleExt(e)}>.{e} ✕</button>)}</div>
              )}
              <div className="flex gap-2">
                <input className="input" placeholder="Custom extension (e.g. srt)" value={customExt} onChange={(e) => setCustomExt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customExt.trim()) { const n = normalizeExtension(customExt); if (n && !filter.extensions.includes(n)) toggleExt(n); setCustomExt(""); } }} />
                <button className="btn btn-secondary" onClick={() => { const n = normalizeExtension(customExt); if (n && !filter.extensions.includes(n)) toggleExt(n); setCustomExt(""); }}>Add</button>
              </div>
            </div>
          </Card>

          <Card title="Size & date">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Min size (MB)</label><input className="input" type="number" min={0} value={minMb} onChange={(e) => setMinMb(e.target.value)} placeholder="0" /></div>
              <div><label className="label">Max size (MB)</label><input className="input" type="number" min={0} value={maxMb} onChange={(e) => setMaxMb(e.target.value)} placeholder="∞" /></div>
              <div><label className="label">From date</label><input className="input" type="date" value={f.dateFrom ?? ""} onChange={(e) => setF((p) => ({ ...p, dateFrom: e.target.value || null }))} /></div>
              <div><label className="label">To date</label><input className="input" type="date" value={f.dateTo ?? ""} onChange={(e) => setF((p) => ({ ...p, dateTo: e.target.value || null }))} /></div>
            </div>
            <p className="help">Leave dates empty to scan the entire accessible history.</p>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-3">
          <Card title="Destination" subtitle="A folder per keyword is created inside the base folder">
            <DestinationSelector />
            <div className="mt-4 rounded-xl border border-line p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Folder preview</div>
              <ul className="space-y-1 mono text-xs">
                {previewFolders.slice(0, 6).map((k) => (
                  <li key={k} className="truncate"><span className="text-faint">{base}{sep}</span><span className="text-accent">{k.replace(/[<>:"/\\|?*]/g, "_")}</span>{state?.settings.channelSubfolders && <span className="text-faint">{sep}{"<channel>"}</span>}{state?.settings.dateSubfolders && <span className="text-faint">{sep}YYYY-MM</span>}<span className="text-faint">{sep}…</span></li>
                ))}
                {previewFolders.length > 6 && <li className="text-faint">+{previewFolders.length - 6} more</li>}
              </ul>
              {!filter.includeKeywords.length && <p className="help">No keywords → files go to the fallback folder “{state?.settings.fallbackFolder}”. Change it in Settings.</p>}
            </div>
          </Card>

          <Card
            title={scan?.running ? `Scanning ${scan.currentChannel ?? "…"}` : results.length ? `${results.length} matching files` : "Matching files"}
            subtitle={scan ? `${scan.messagesExamined.toLocaleString()} messages examined · ${scan.mediaSeen.toLocaleString()} attachments · ${scan.matches} matches${scan.totalEstimate ? ` · ~${Math.max(0, scan.totalEstimate - scan.messagesExamined).toLocaleString()} remaining` : ""}` : "Run a scan to preview results"}
            actions={
              <>
                {scan?.running && <button className="btn btn-danger btn-sm" onClick={() => void api("/api/scan", { action: "cancel" })}>Cancel scan</button>}
                {results.length > 0 && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPicked(picked.size === pending.length ? new Set() : new Set(pending.map(key)))}>{picked.size === pending.length && pending.length ? "Clear selection" : "Select all"}</button>
                    <button className="btn btn-primary btn-sm" disabled={busy || pending.length === 0} onClick={() => void enqueue(picked.size ? Array.from(picked) : pending.map(key))}>
                      ⇣ Download {picked.size ? `${picked.size} selected` : `all (${pending.length})`}
                    </button>
                  </>
                )}
              </>
            }
          >
            {scan?.running && (
              <div className="mb-4">
                <Progress value={scan.totalEstimate ? pct : 30} active />
                <div className="mt-1.5 flex justify-between text-xs text-muted"><span>Channel {Math.min(scan.channelsDone + 1, scan.channelsTotal)} of {scan.channelsTotal}</span><span>{scan.totalEstimate ? `${pct.toFixed(0)}%` : "estimating…"}</span></div>
              </div>
            )}
            {scan?.error && <div className="mb-4 rounded-xl border p-3 text-sm" style={{ borderColor: "rgba(255,107,138,.4)", color: "var(--danger)", background: "rgba(255,107,138,.08)" }}>{scan.error}</div>}
            {!scan?.running && results.length === 0 && (
              selected.length === 0
                ? <EmptyState icon="◎" title="No channels selected" body="Select at least one channel to scan." action={<Link href="/channels" className="btn btn-secondary">Choose channels</Link>} />
                : <EmptyState icon="⌕" title={scan?.finishedAt ? "No files matched" : "Ready to scan"} body={scan?.finishedAt ? "Try broader keywords, fewer extensions, or a wider date range." : "Set your filters and press Scan. Nothing is downloaded until you confirm."} />
            )}
            {results.length > 0 && (
              <div className="max-h-[640px] space-y-1.5 overflow-auto pr-1">
                {results.map((r) => {
                  const k = key(r);
                  const disabled = r.queued || r.alreadyDownloaded;
                  const on = picked.has(k);
                  return (
                    <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition ${on ? "border-accent" : "border-line hover:bg-card-hover"} ${disabled ? "opacity-60" : ""}`} style={on ? { background: "rgba(109,124,255,.08)" } : undefined}>
                      <input type="checkbox" className="accent-[var(--accent)]" disabled={disabled} checked={on} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
                      <FileIcon name={r.fileName} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" title={r.fileName}>{r.fileName}</div>
                        <div className="truncate text-xs text-muted">{r.channelTitle} · {new Date(r.date).toLocaleDateString()} · {formatBytes(r.size)}{r.caption ? ` · “${r.caption.slice(0, 60)}”` : ""}</div>
                        <div className="truncate mono text-[11px] text-faint" title={r.destinationDir}>→ {r.destinationDir}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {r.matchedKeywords.length > 0 && <span className="chip chip-on h-6 cursor-default">{r.matchedKeywords[0]}{r.matchedKeywords.length > 1 ? ` +${r.matchedKeywords.length - 1}` : ""}</span>}
                        {r.alreadyDownloaded && <span className="badge badge-completed">downloaded</span>}
                        {r.queued && !r.alreadyDownloaded && <span className="badge badge-queued">queued</span>}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save filter profile" footer={<><button className="btn btn-secondary" onClick={() => setSaveOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={!profileName.trim()} onClick={() => void saveProfile()}>Save</button></>}>
        <label className="label">Profile name</label>
        <input className="input" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="e.g. Python PDFs" autoFocus />
        {profiles.length > 0 && (
          <div className="mt-4">
            <div className="label">Existing profiles</div>
            <ul className="space-y-1">{profiles.map((p) => <li key={p.id} className="flex items-center justify-between text-sm"><span>{p.name}</span><button className="btn btn-ghost btn-sm text-danger" onClick={() => { void api("/api/profiles", { id: p.id }, "DELETE"); setProfiles((ps) => ps.filter((x) => x.id !== p.id)); }}>Delete</button></li>)}</ul>
          </div>
        )}
        <p className="help">Profiles store keywords, extensions, size and date filters.</p>
      </Modal>
      <DestinationConfirmDialog open={confirmDest} onClose={() => setConfirmDest(false)} onConfirmed={() => void startScan()} />
    </div>
  );
}
