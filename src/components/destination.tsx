"use client";
import { useState } from "react";
import { useStore } from "./store";
import { FolderPicker, Modal, formatBytes } from "./ui";

/** Persistent destination selector: Browse / Open Folder / Restore Default. */
export function DestinationSelector({ compact }: { compact?: boolean }) {
  const { state, api, toast } = useStore();
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const { settings, destination } = state;

  const setDest = async (p: string) => {
    setBusy(true);
    try {
      await api("/api/settings", { destinationDir: p, destinationConfirmed: true }, "PUT");
      toast({ title: "Destination updated", body: p, level: "success" });
    } catch (e) {
      toast({ title: "Destination not usable", body: e instanceof Error ? e.message : String(e), level: "error" });
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    const r = await api<{ path: string }>("/api/settings", { action: "defaultDestination" });
    await setDest(r.path);
  };
  const openFolder = async () => {
    try {
      await api("/api/fs", { action: "open", path: settings.destinationDir });
    } catch (e) {
      toast({ title: "Cannot open folder", body: e instanceof Error ? e.message : String(e), level: "error" });
    }
  };
  const low = destination.freeBytes != null && destination.freeBytes < 500 * 1024 * 1024;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="input flex min-w-0 flex-1 items-center gap-2 mono text-xs" title={settings.destinationDir}>
          <span style={{ color: "var(--warning)" }}>▰</span>
          <span className="truncate">{settings.destinationDir}</span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setPick(true)} disabled={busy}>Browse…</button>
        <button className="btn btn-ghost btn-sm" onClick={() => void openFolder()}>Open folder</button>
        {!compact && <button className="btn btn-ghost btn-sm" onClick={() => void restore()} disabled={busy}>Restore default</button>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
        {destination.ok ? (
          <span className="text-success">● Writable</span>
        ) : (
          <span className="text-danger">● {destination.error ?? "Not accessible"} — choose another folder</span>
        )}
        {destination.freeBytes != null && <span className={low ? "text-danger" : "text-muted"}>{formatBytes(destination.freeBytes)} free{low ? " — low disk space" : ""}</span>}
        {!settings.destinationConfirmed && <span className="text-warning">Not confirmed yet</span>}
      </div>
      <FolderPicker open={pick} onClose={() => setPick(false)} initial={settings.destinationDir} onPick={(p) => void setDest(p)} />
    </div>
  );
}

/** First-session confirmation of the download destination. */
export function DestinationConfirmDialog({ open, onClose, onConfirmed }: { open: boolean; onClose: () => void; onConfirmed: () => void }) {
  const { state, api } = useStore();
  const [pick, setPick] = useState(false);
  if (!state) return null;
  const confirm = async (p?: string) => {
    await api("/api/settings", { destinationDir: p ?? state.settings.destinationDir, destinationConfirmed: true }, "PUT");
    onConfirmed();
    onClose();
  };
  return (
    <>
      <Modal open={open && !pick} onClose={onClose} title="Where should files be saved?" footer={<><button className="btn btn-secondary" onClick={() => setPick(true)}>Choose another folder…</button><button className="btn btn-primary" onClick={() => void confirm()}>Use this folder</button></>}>
        <p className="text-sm text-muted">By default TeleFetch Studio saves into your Downloads folder. A subfolder is created for each search keyword (for example <span className="mono text-ink">Downloads/Python/</span>).</p>
        <div className="mt-4 rounded-xl border border-line p-3 mono text-xs break-all">{state.settings.destinationDir}</div>
        {state.destination.freeBytes != null && <p className="help">{formatBytes(state.destination.freeBytes)} available</p>}
      </Modal>
      <FolderPicker open={pick} onClose={() => setPick(false)} initial={state.settings.destinationDir} onPick={(p) => void confirm(p)} />
    </>
  );
}
