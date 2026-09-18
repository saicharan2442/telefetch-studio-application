"use client";
import Link from "next/link";
import { useStore } from "@/components/store";
import { Card, EmptyState, PageHeader, Toggle, timeAgo } from "@/components/ui";

export default function MonitorPage() {
  const { state, api, toast } = useStore();
  if (!state) return <div className="skeleton h-64" />;
  const { monitor, channels, settings, activity } = state;
  const monitored = channels.filter((c) => c.monitor);
  const run = (action: string) => api("/api/settings", { action }).catch((e) => toast({ title: "Monitoring", body: e.message, level: "error" }));
  const events = activity.filter((a) => a.kind === "monitor" || (a.kind === "download" && a.level !== "info"));
  const status = monitor.status;
  const filter = settings.activeFilter;

  return (
    <div className="space-y-6">
      <PageHeader title="Live Monitor" subtitle="Watches monitored channels for new posts while TeleFetch Studio is running and applies your active filters to every new attachment." actions={
        <>
          {status === "stopped" && <button className="btn btn-primary" onClick={() => void run("monitor-start")} disabled={monitored.length === 0 || state.connection.stage !== "authorized"}>● Start monitoring</button>}
          {status === "running" && <button className="btn btn-secondary" onClick={() => void run("monitor-pause")}>❚❚ Pause</button>}
          {status === "paused" && <button className="btn btn-primary" onClick={() => void run("monitor-resume")}>▶ Resume</button>}
          {status !== "stopped" && <button className="btn btn-danger" onClick={() => void run("monitor-stop")}>■ Stop</button>}
        </>
      } />

      <div className="grid gap-4 md:grid-cols-4">
        <div className="card p-4"><div className="text-xs uppercase tracking-wide text-muted">Status</div><div className="mt-1 flex items-center gap-2 text-xl font-semibold capitalize"><span className={`dot ${status === "running" ? "dot-live" : ""}`} style={{ background: status === "running" ? "var(--success)" : status === "paused" ? "var(--warning)" : "var(--text-faint)", color: "var(--success)" }} />{status}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-wide text-muted">Channels watched</div><div className="mt-1 text-xl font-semibold">{status === "stopped" ? monitored.length : monitor.channelIds.length}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-wide text-muted">New posts seen</div><div className="mt-1 text-xl font-semibold">{monitor.eventsSeen}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-wide text-muted">Matched files</div><div className="mt-1 text-xl font-semibold text-success">{monitor.matched}</div></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5">
          <Card title="Auto-download" subtitle="Enqueue matching files as soon as they are posted">
            <Toggle on={settings.autoDownloadOnMonitor} onChange={(v) => void api("/api/settings", { autoDownloadOnMonitor: v }, "PUT")} label="Add matches to the queue automatically" help={settings.autoDownloadOnMonitor ? "Matches download immediately" : "Matches are only listed in the feed"} />
            <div className="mt-4 rounded-xl border border-line p-3 text-xs">
              <div className="mb-1 font-semibold uppercase tracking-wide text-faint">Active filter</div>
              <div className="text-muted">Keywords: <span className="text-ink">{filter.includeKeywords.length ? filter.includeKeywords.join(", ") : "any file"}</span></div>
              {filter.excludeKeywords.length > 0 && <div className="text-muted">Excluding: <span className="text-ink">{filter.excludeKeywords.join(", ")}</span></div>}
              <div className="text-muted">Types: <span className="text-ink">{filter.extensions.length ? filter.extensions.map((e) => `.${e}`).join(" ") : "all"}</span></div>
              <Link href="/search" className="mt-2 inline-block text-accent">Edit filters →</Link>
            </div>
            <p className="help">Monitoring only runs while this app is open. Closing it stops live detection; nothing runs in the background.</p>
          </Card>
          <Card title="Monitored channels" actions={<Link href="/channels" className="btn btn-ghost btn-sm">Manage</Link>}>
            {monitored.length === 0 ? <p className="text-sm text-muted">Enable the “Monitor” toggle on a channel to watch it.</p> : (
              <ul className="space-y-2">
                {monitored.map((c) => (
                  <li key={c.id} className="card card-hover flex items-center gap-3 p-3">
                    <span className={`dot ${status === "running" ? "dot-live" : ""}`} style={{ background: status === "running" ? "var(--success)" : status === "paused" ? "var(--warning)" : "var(--text-faint)", color: "var(--success)" }} />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c.title}</div><div className="text-xs text-muted">{c.username ? `@${c.username}` : c.kind}</div></div>
                    <Toggle on={c.monitor} onChange={(v) => void api("/api/channels", { action: "monitor", id: c.id, value: v })} />
                  </li>
                ))}
              </ul>
            )}
            {status !== "stopped" && monitored.length !== monitor.channelIds.length && <p className="help text-warning">Channel list changed — restart monitoring to apply.</p>}
          </Card>
        </div>

        <Card className="xl:col-span-2" title="Live event stream" subtitle="New posts, matched files, queue additions, completions and errors">
          {monitor.recentMatches.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Newly detected files</div>
              <div className="flex flex-wrap gap-2">{monitor.recentMatches.slice(0, 8).map((m, i) => <span key={i} className="chip cursor-default" title={m.channelTitle}>{m.fileName}{m.keyword ? ` · ${m.keyword}` : ""}</span>)}</div>
            </div>
          )}
          {events.length === 0 ? <EmptyState icon="◉" title={status === "running" ? "Listening…" : "Monitor is idle"} body={status === "running" ? "New posts in your monitored channels will appear here the moment they arrive." : "Start monitoring to see events in real time."} /> : (
            <ul className="max-h-[560px] space-y-1 overflow-auto pr-1">
              {events.map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-card-hover">
                  <span className="mt-1.5 dot" style={{ background: `var(--${a.level === "info" ? "info" : a.level})` }} />
                  <span className="min-w-0 flex-1 text-sm">{a.message}</span>
                  <span className="shrink-0 text-xs text-faint tabular-nums">{timeAgo(a.createdAt, state.now)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
