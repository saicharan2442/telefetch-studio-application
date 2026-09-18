"use client";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/components/store";
import { Card, EmptyState, FileIcon, PageHeader, Progress, Skeleton, Stat, Badge, formatBytes, timeAgo } from "@/components/ui";
import { DestinationSelector, DestinationConfirmDialog } from "@/components/destination";

export default function DashboardPage() {
  const { state } = useStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (!state) return <div className="space-y-4"><div className="skeleton h-8 w-64" /><div className="grid gap-4 md:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div><Skeleton rows={5} /></div>;

  const { stats, tasks, activity, channels, connection, monitor, settings, destination } = state;
  const active = tasks.filter((t) => t.status === "downloading");
  const recent = tasks.filter((t) => t.status === "completed").slice(0, 6);
  const signedIn = connection.stage === "authorized";
  const usedPct = destination.freeBytes != null && stats.totalBytes > 0 ? Math.min(100, (stats.totalBytes / (stats.totalBytes + destination.freeBytes)) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={signedIn ? `Welcome back, ${connection.user?.name.split(" ")[0]}` : "Welcome to TeleFetch Studio"}
        subtitle={signedIn ? "Scan channel history, filter files by keyword, and let the queue do the rest." : "Connect your own Telegram account to start scanning channels you already have access to."}
        actions={
          <>
            {!signedIn && <Link href="/settings#telegram" className="btn btn-primary">Connect Telegram</Link>}
            {signedIn && (
              <>
                <Link href="/channels" className="btn btn-secondary">Choose channels</Link>
                <button className="btn btn-primary" onClick={() => (settings.destinationConfirmed ? (window.location.href = "/search") : setConfirmOpen(true))}>New scan</button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 fade-in">
        <Stat label="Queued" value={stats.queued ?? 0} accent="var(--info)" hint="waiting for a worker" />
        <Stat label="Downloading" value={stats.downloading ?? 0} accent="var(--accent)" hint={`${settings.concurrency} parallel max`} />
        <Stat label="Completed" value={stats.totalCompleted} accent="var(--success)" hint="all time" />
        <Stat label="Failed" value={stats.failed ?? 0} accent={stats.failed ? "var(--danger)" : undefined} hint="retry from the queue" />
        <Stat label="Total downloaded" value={formatBytes(stats.totalBytes)} hint="verified on disk" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Live activity" subtitle="Scans, monitoring events, queue changes and completions" actions={<Link href="/monitor" className="btn btn-ghost btn-sm">Open monitor →</Link>}>
          {active.length > 0 && (
            <div className="mb-4 space-y-3">
              {active.map((t) => {
                const m = state.metrics[t.id];
                const pct = m && m.total ? (m.downloaded / m.total) * 100 : t.progress;
                return (
                  <div key={t.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center gap-3">
                      <FileIcon name={t.fileName} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.fileName}</div>
                        <div className="text-xs text-muted">{t.channelTitle} · {formatBytes(m?.downloaded ?? t.downloadedBytes)} / {formatBytes(m?.total || t.size)} · {m ? `${formatBytes(m.speedBps)}/s` : "starting…"}</div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="mt-2"><Progress value={pct} active /></div>
                  </div>
                );
              })}
            </div>
          )}
          {activity.length === 0 ? (
            <EmptyState icon="◉" title="Nothing has happened yet" body="Once you connect Telegram and start a scan, every event shows up here in real time." />
          ) : (
            <ul className="max-h-[420px] space-y-1 overflow-auto pr-1">
              {activity.slice(0, 40).map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-card-hover">
                  <span className="mt-1.5 dot" style={{ background: `var(--${a.level === "info" ? "info" : a.level})` }} />
                  <span className="min-w-0 flex-1 text-sm">{a.message}</span>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-faint">{a.kind}</span>
                  <span className="shrink-0 text-xs text-faint tabular-nums">{timeAgo(a.createdAt, state.now)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Destination" subtitle="Keyword folders are created inside this base folder">
            <DestinationSelector compact />
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-muted"><span>Downloaded by TeleFetch</span><span>{formatBytes(stats.totalBytes)}</span></div>
              <Progress value={usedPct} />
              <div className="mt-1 text-xs text-faint">{destination.freeBytes != null ? `${formatBytes(destination.freeBytes)} free on this volume` : "Free space unknown"}</div>
            </div>
          </Card>

          <Card title="Channels" subtitle={`${channels.filter((c) => c.selected).length} selected · ${channels.filter((c) => c.monitor).length} monitored`} actions={<Link href="/channels" className="btn btn-ghost btn-sm">Manage</Link>}>
            {channels.length === 0 ? (
              <p className="text-sm text-muted">No channels saved yet. Add channels you are a member of, or paste a public @username.</p>
            ) : (
              <ul className="space-y-2">
                {channels.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold" style={{ background: "rgba(109,124,255,.14)", color: "var(--accent)" }}>{c.title.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    {c.monitor && <span className={`dot ${monitor.status === "running" ? "dot-live" : ""}`} style={{ background: monitor.status === "running" ? "var(--success)" : "var(--text-faint)", color: "var(--success)" }} title="Monitoring" />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card title="Recent downloads" actions={<Link href="/completed" className="btn btn-ghost btn-sm">View all →</Link>}>
        {recent.length === 0 ? (
          <EmptyState icon="⇣" title="No downloads yet" body="Matching files you download will appear here with their final location." action={signedIn ? <Link href="/search" className="btn btn-primary">Start a scan</Link> : undefined} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recent.map((t) => (
              <div key={t.id} className="card card-hover flex items-center gap-3 p-3">
                <FileIcon name={t.fileName} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={t.fileName}>{t.fileName}</div>
                  <div className="truncate text-xs text-muted">{t.channelTitle}{t.matchedKeyword ? ` · “${t.matchedKeyword}”` : ""} · {formatBytes(t.size)}</div>
                </div>
                <Badge status={t.status} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <DestinationConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirmed={() => (window.location.href = "/search")} />
    </div>
  );
}
