"use client";
import type { DownloadTask } from "@/db";
import type { LiveMetric } from "@/lib/telegram/downloader";
import { useStore } from "./store";
import { Badge, FileIcon, Progress, formatBytes, formatEta } from "./ui";

export function TaskRow({ t, m }: { t: DownloadTask; m?: LiveMetric }) {
  const { api, toast } = useStore();
  const act = (a: "pause" | "resume" | "retry" | "cancel" | "remove") => api("/api/queue", { action: "task", id: t.id, taskAction: a }).catch((e) => toast({ title: "Action failed", body: e.message, level: "error" }));
  const open = (reveal: boolean) => api("/api/fs", { action: "open", path: reveal && t.finalPath ? t.finalPath : t.destinationDir, reveal }).catch((e) => toast({ title: "Cannot open", body: e.message, level: "error" }));
  const downloading = t.status === "downloading";
  const pct = downloading && m && m.total ? (m.downloaded / m.total) * 100 : t.progress;
  return (
    <div className="card card-hover p-3 fade-in">
      <div className="flex items-center gap-3">
        <FileIcon name={t.fileName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium" title={t.fileName}>{t.fileName}</span>
            <Badge status={t.status} />
            {t.source === "monitor" && <span className="badge" style={{ background: "rgba(169,112,255,.14)", color: "var(--accent-2)" }}>live</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span>{t.channelTitle}</span>
            {t.matchedKeyword && <span className="text-accent">“{t.matchedKeyword}”</span>}
            <span>{formatBytes(t.size)}</span>
            {downloading && m && <span className="tabular-nums">{formatBytes(m.speedBps)}/s · ETA {formatEta(m.etaSec)}</span>}
            {t.attempts > 1 && <span>attempt {t.attempts}</span>}
          </div>
          <div className="truncate mono text-[11px] text-faint" title={t.finalPath ?? t.destinationDir}>→ {t.finalPath ?? t.destinationDir}</div>
          {t.error && <div className="mt-0.5 truncate text-xs text-danger" title={t.error}>{t.error}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {downloading && <button className="btn btn-ghost btn-sm" onClick={() => void act("pause")}>Pause</button>}
          {t.status === "paused" && <button className="btn btn-secondary btn-sm" onClick={() => void act("resume")}>Resume</button>}
          {(t.status === "failed" || t.status === "cancelled" || t.status === "skipped") && <button className="btn btn-secondary btn-sm" onClick={() => void act("retry")}>Retry</button>}
          {(t.status === "queued" || downloading || t.status === "paused") && <button className="btn btn-ghost btn-sm text-danger" onClick={() => void act("cancel")}>Cancel</button>}
          {t.status === "completed" && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => void open(true)}>Show file</button>
              <button className="btn btn-ghost btn-sm" onClick={() => void open(false)}>Folder</button>
            </>
          )}
          {!downloading && <button className="btn btn-ghost btn-icon" title="Remove from queue" onClick={() => void act("remove")}>✕</button>}
        </div>
      </div>
      {(downloading || t.status === "queued" || t.status === "paused") && (
        <div className="mt-2.5 flex items-center gap-3">
          <div className="flex-1"><Progress value={pct} active={downloading} /></div>
          <span className="w-24 text-right text-xs tabular-nums text-muted">{downloading && m ? `${formatBytes(m.downloaded)} · ${pct.toFixed(0)}%` : t.status}</span>
        </div>
      )}
    </div>
  );
}
