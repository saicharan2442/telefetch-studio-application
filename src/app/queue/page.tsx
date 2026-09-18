"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { TaskRow } from "@/components/task-row";
import { Card, EmptyState, PageHeader, Progress, formatBytes, ConfirmDialog } from "@/components/ui";

const FILTERS = ["all", "queued", "downloading", "paused", "failed", "cancelled", "skipped"] as const;

export default function QueuePage() {
  const { state, api } = useStore();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<"cancelAll" | "clearFinished" | null>(null);

  const tasks = useMemo(() => {
    const active = (state?.tasks ?? []).filter((t) => t.status !== "completed");
    return active.filter((t) => (filter === "all" || t.status === filter) && (!q || t.fileName.toLowerCase().includes(q.toLowerCase()) || t.channelTitle.toLowerCase().includes(q.toLowerCase())));
  }, [state, filter, q]);

  if (!state) return <div className="skeleton h-64" />;
  const live = Object.values(state.metrics);
  const speed = live.reduce((a, m) => a + m.speedBps, 0);
  const pendingList = state.tasks.filter((t) => ["queued", "downloading", "paused"].includes(t.status));
  const totalBytes = pendingList.reduce((a, t) => a + t.size, 0);
  const doneBytes = pendingList.reduce((a, t) => a + (state.metrics[t.id]?.downloaded ?? t.downloadedBytes), 0);
  const overall = totalBytes ? (doneBytes / totalBytes) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Download Queue" subtitle="Persistent queue — interrupted jobs are re-queued automatically when the app restarts." actions={
        <>
          {state.queuePaused ? <button className="btn btn-primary" onClick={() => void api("/api/queue", { action: "resumeAll" })}>▶ Resume queue</button> : <button className="btn btn-secondary" onClick={() => void api("/api/queue", { action: "pauseAll" })} disabled={pendingList.length === 0}>❚❚ Pause queue</button>}
          <button className="btn btn-secondary" onClick={() => void api("/api/queue", { action: "bulk", bulk: "retryFailed" })} disabled={!state.stats.failed && !state.stats.cancelled}>Retry failed</button>
          <button className="btn btn-ghost" onClick={() => setConfirm("clearFinished")}>Clear finished</button>
          <button className="btn btn-danger" onClick={() => setConfirm("cancelAll")} disabled={pendingList.length === 0}>Cancel all</button>
        </>
      } />

      <Card>
        <div className="grid gap-4 md:grid-cols-4">
          <div><div className="text-xs uppercase tracking-wide text-muted">Overall progress</div><div className="mt-1 text-2xl font-semibold tabular-nums">{overall.toFixed(0)}%</div></div>
          <div><div className="text-xs uppercase tracking-wide text-muted">Speed</div><div className="mt-1 text-2xl font-semibold tabular-nums">{formatBytes(speed)}/s</div></div>
          <div><div className="text-xs uppercase tracking-wide text-muted">Remaining</div><div className="mt-1 text-2xl font-semibold tabular-nums">{formatBytes(Math.max(0, totalBytes - doneBytes))}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-muted">Workers</div><div className="mt-1 text-2xl font-semibold tabular-nums">{live.length} / {state.settings.concurrency}</div></div>
        </div>
        <div className="mt-4"><Progress value={overall} active={live.length > 0} /></div>
        {state.queuePaused && <p className="mt-2 text-xs text-warning">Queue is paused. New tasks will wait until you resume.</p>}
        {state.connection.stage !== "authorized" && pendingList.length > 0 && <p className="mt-2 text-xs text-danger">Not signed in to Telegram — downloads will start once you reconnect.</p>}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => <button key={f} className={`chip ${filter === f ? "chip-on" : ""}`} onClick={() => setFilter(f)}>{f}{f !== "all" && state.stats[f] ? ` · ${state.stats[f]}` : ""}</button>)}
        <input className="input ml-auto w-64" placeholder="Filter by name or channel" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {tasks.length === 0 ? (
        <Card><EmptyState icon="⇣" title="Queue is empty" body="Scan a channel and pick files to download, or enable monitoring to enqueue new matches automatically." action={<Link href="/search" className="btn btn-primary">Go to Search</Link>} /></Card>
      ) : (
        <div className="space-y-2">{tasks.map((t) => <TaskRow key={t.id} t={t} m={state.metrics[t.id]} />)}</div>
      )}
      <ConfirmDialog open={confirm === "cancelAll"} onClose={() => setConfirm(null)} title="Cancel all downloads?" body="Active transfers are stopped and partial files are removed. You can retry later." confirmLabel="Cancel all" danger onConfirm={() => void api("/api/queue", { action: "bulk", bulk: "cancelAll" })} />
      <ConfirmDialog open={confirm === "clearFinished"} onClose={() => setConfirm(null)} title="Clear finished tasks?" body="Completed, skipped and cancelled tasks are removed from the queue. Files on disk and the history log are kept." confirmLabel="Clear" onConfirm={() => void api("/api/queue", { action: "bulk", bulk: "clearFinished" })} />
    </div>
  );
}
