"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Badge, Card, ConfirmDialog, EmptyState, FileIcon, PageHeader, formatBytes } from "@/components/ui";
import type { HistoryRow } from "@/db";

export default function HistoryPage() {
  const { state, api, toast } = useStore();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [clear, setClear] = useState(false);
  const load = () => fetch("/api/history", { cache: "no-store" }).then((r) => r.json()).then(setRows).catch(() => setRows([]));
  useEffect(() => { void load(); }, [state?.stats.totalCompleted, state?.stats.failed]);
  const list = useMemo(() => (rows ?? []).filter((r) => (!status || r.status === status) && (!q || r.fileName.toLowerCase().includes(q.toLowerCase()) || r.channelTitle.toLowerCase().includes(q.toLowerCase()) || (r.matchedKeyword ?? "").toLowerCase().includes(q.toLowerCase()))), [rows, status, q]);
  const totals = useMemo(() => ({ completed: (rows ?? []).filter((r) => r.status === "completed").length, failed: (rows ?? []).filter((r) => r.status === "failed").length, bytes: (rows ?? []).filter((r) => r.status === "completed").reduce((a, r) => a + r.size, 0) }), [rows]);
  const byKeyword = useMemo(() => { const m = new Map<string, number>(); for (const r of rows ?? []) if (r.status === "completed") m.set(r.matchedKeyword ?? "(no keyword)", (m.get(r.matchedKeyword ?? "(no keyword)") ?? 0) + 1); return Array.from(m).sort((a, b) => b[1] - a[1]).slice(0, 8); }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader title="History & Reports" subtitle="Every completed, failed, skipped or cancelled transfer — persisted across restarts." actions={<><a className="btn btn-secondary" href="/api/history?format=csv">Export CSV</a><button className="btn btn-ghost text-danger" onClick={() => setClear(true)} disabled={!rows?.length}>Clear history</button></>} />
      <div className="grid gap-4 md:grid-cols-4">
        <div className="card p-4"><div className="text-xs uppercase tracking-wide text-muted">Completed</div><div className="mt-1 text-2xl font-semibold text-success">{totals.completed}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-wide text-muted">Failed</div><div className="mt-1 text-2xl font-semibold" style={{ color: totals.failed ? "var(--danger)" : undefined }}>{totals.failed}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-wide text-muted">Total size</div><div className="mt-1 text-2xl font-semibold">{formatBytes(totals.bytes)}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-wide text-muted">Top keywords</div><div className="mt-1 flex flex-wrap gap-1">{byKeyword.length === 0 ? <span className="text-sm text-faint">—</span> : byKeyword.map(([k, n]) => <span key={k} className="chip cursor-default h-6">{k} · {n}</span>)}</div></div>
      </div>
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          {["", "completed", "failed", "skipped", "cancelled"].map((s) => <button key={s} className={`chip ${status === s ? "chip-on" : ""}`} onClick={() => setStatus(s)}>{s || "all"}</button>)}
          <input className="input ml-auto w-72" placeholder="Search file, channel, keyword" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {rows === null ? <div className="skeleton h-40" /> : list.length === 0 ? <EmptyState icon="▤" title="No history yet" body="Transfers are recorded here with timestamp, channel, size, matched keyword and destination." /> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-faint"><th className="pb-2 pr-3 font-medium">File</th><th className="pb-2 pr-3 font-medium">Channel</th><th className="pb-2 pr-3 font-medium">Keyword</th><th className="pb-2 pr-3 font-medium">Size</th><th className="pb-2 pr-3 font-medium">Status</th><th className="pb-2 pr-3 font-medium">When</th><th className="pb-2 font-medium"></th></tr></thead>
              <tbody className="divide-y divide-line">
                {list.map((r) => (
                  <tr key={r.id} className="hover:bg-card-hover">
                    <td className="py-2 pr-3"><div className="flex items-center gap-2"><FileIcon name={r.fileName} size={28} /><div className="min-w-0"><div className="max-w-[320px] truncate font-medium" title={r.fileName}>{r.fileName}</div><div className="max-w-[320px] truncate mono text-[10px] text-faint" title={r.destination}>{r.destination}</div></div></div></td>
                    <td className="py-2 pr-3 text-muted">{r.channelTitle}</td>
                    <td className="py-2 pr-3">{r.matchedKeyword ? <span className="text-accent">“{r.matchedKeyword}”</span> : <span className="text-faint">—</span>}</td>
                    <td className="py-2 pr-3 tabular-nums text-muted">{formatBytes(r.size)}</td>
                    <td className="py-2 pr-3"><Badge status={r.status} />{r.error && <div className="max-w-[200px] truncate text-[11px] text-danger" title={r.error}>{r.error}</div>}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted">{new Date(r.completedAt).toLocaleString()}</td>
                    <td className="py-2 text-right">{r.status === "completed" && <button className="btn btn-ghost btn-sm" onClick={() => void api("/api/fs", { action: "open", path: r.destination, reveal: true }).catch((e) => toast({ title: "Cannot open", body: e.message, level: "error" }))}>Show</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ConfirmDialog open={clear} onClose={() => setClear(false)} title="Clear download history?" body="This removes the report log only. Downloaded files and duplicate-detection records are kept." confirmLabel="Clear" danger onConfirm={() => void api("/api/history", undefined, "DELETE").then(load)} />
    </div>
  );
}
