"use client";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/components/store";
import { Card, EmptyState, PageHeader, Skeleton, Toggle, ConfirmDialog } from "@/components/ui";
import type { DiscoveredChannel } from "@/lib/telegram/client";

export default function ChannelsPage() {
  const { state, api, toast } = useStore();
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const [results, setResults] = useState<DiscoveredChannel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const signedIn = state?.connection.stage === "authorized";

  const search = async () => {
    setLoading(true);
    try {
      setResults(await api<DiscoveredChannel[]>("/api/channels", { action: "search", query }));
    } catch (e) {
      toast({ title: "Search failed", body: e instanceof Error ? e.message : String(e), level: "error" });
    } finally {
      setLoading(false);
    }
  };
  const resolve = async () => {
    setLoading(true);
    try {
      const c = await api<DiscoveredChannel>("/api/channels", { action: "resolve", link });
      setResults([c]);
    } catch (e) {
      toast({ title: "Could not resolve", body: e instanceof Error ? e.message : String(e), level: "error" });
    } finally {
      setLoading(false);
    }
  };
  const add = async (c: DiscoveredChannel) => {
    await api("/api/channels", { action: "add", channel: c });
    toast({ title: "Channel added", body: c.title, level: "success" });
  };

  const saved = state?.channels ?? [];
  const savedIds = new Set(saved.map((c) => c.telegramId));
  const selectedCount = saved.filter((c) => c.selected).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Channels"
        subtitle="Pick the channels and groups to scan or monitor. You will only see chats your Telegram account is already authorized to view."
        actions={
          <>
            <Link href="/search" className={`btn btn-primary ${selectedCount === 0 ? "pointer-events-none opacity-50" : ""}`}>Scan history ({selectedCount})</Link>
            <Link href="/monitor" className="btn btn-secondary">Monitor</Link>
          </>
        }
      />

      {!signedIn && (
        <Card><EmptyState icon="◎" title="Sign in to discover channels" body="Channel discovery uses your own account's chat list. Connect Telegram in Settings first." action={<Link href="/settings#telegram" className="btn btn-primary">Connect Telegram</Link>} /></Card>
      )}

      {signedIn && (
        <div className="grid gap-5 lg:grid-cols-5">
          <Card className="lg:col-span-2" title="Find channels" subtitle="From your chat list, or by public username / t.me link">
            <label className="label">Search my channels</label>
            <div className="flex gap-2">
              <input className="input" placeholder="Name or @username" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} />
              <button className="btn btn-secondary" onClick={() => void search()} disabled={loading}>Search</button>
            </div>
            <div className="my-4 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
            <label className="label">Public username or link</label>
            <div className="flex gap-2">
              <input className="input" placeholder="@channel or https://t.me/channel" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void resolve()} />
              <button className="btn btn-secondary" onClick={() => void resolve()} disabled={loading || !link.trim()}>Resolve</button>
            </div>
            <p className="help">Private channels work only if your account is already a member. TeleFetch never bypasses access controls.</p>

            <div className="mt-5">
              {loading && <Skeleton rows={4} />}
              {!loading && results && results.length === 0 && <p className="text-sm text-muted">No channels found.</p>}
              {!loading && results && results.length > 0 && (
                <ul className="max-h-[420px] space-y-2 overflow-auto pr-1">
                  {results.map((c) => (
                    <li key={c.telegramId} className="card card-hover flex items-center gap-3 p-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold" style={{ background: "rgba(169,112,255,.14)", color: "var(--accent-2)" }}>{c.title.slice(0, 1).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c.title}</div>
                        <div className="truncate text-xs text-muted">{c.username ? `@${c.username}` : c.kind}{c.participants ? ` · ${c.participants.toLocaleString()} members` : ""}</div>
                      </div>
                      <button className="btn btn-sm btn-primary" disabled={savedIds.has(c.telegramId)} onClick={() => void add(c)}>{savedIds.has(c.telegramId) ? "Added" : "Add"}</button>
                    </li>
                  ))}
                </ul>
              )}
              {!loading && !results && <p className="text-sm text-faint">Search to see results from your account.</p>}
            </div>
          </Card>

          <Card className="lg:col-span-3" title="Saved channels" subtitle={`${saved.length} saved · ${selectedCount} selected for scanning · ${saved.filter((c) => c.monitor).length} monitored`}>
            {saved.length === 0 ? (
              <EmptyState icon="◎" title="No channels yet" body="Add channels from the panel on the left. Selected channels are used for history scans; monitored channels are watched for new posts." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {saved.map((c) => (
                  <div key={c.id} className={`card card-hover p-4 ${c.selected ? "" : "opacity-80"}`} style={c.selected ? { borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)", boxShadow: "0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)" } : undefined}>
                    <div className="flex items-start gap-3">
                      <button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold" style={{ background: c.selected ? "linear-gradient(135deg, var(--accent), var(--accent-2))" : "rgba(139,147,179,.14)", color: c.selected ? "white" : "var(--text-muted)" }} onClick={() => void api("/api/channels", { action: "select", id: c.id, value: !c.selected })} aria-label="Toggle selected">
                        {c.selected ? "✓" : c.title.slice(0, 1).toUpperCase()}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{c.title}</div>
                        <div className="truncate text-xs text-muted">{c.username ? `@${c.username}` : c.kind}{c.participants ? ` · ${c.participants.toLocaleString()} members` : ""}</div>
                        <div className="text-[11px] text-faint">{c.lastScannedAt ? `Last scanned ${new Date(c.lastScannedAt).toLocaleString()}` : "Never scanned"}</div>
                      </div>
                      <button className="btn btn-ghost btn-icon" onClick={() => setRemoveId(c.id)} aria-label="Remove">🗑</button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                      <Toggle on={c.selected} onChange={(v) => void api("/api/channels", { action: "select", id: c.id, value: v })} label={<span className="text-xs">Scan</span>} />
                      <Toggle on={c.monitor} onChange={(v) => void api("/api/channels", { action: "monitor", id: c.id, value: v })} label={<span className="text-xs">Monitor {c.monitor && state?.monitor.status === "running" && <span className="dot dot-live ml-1" style={{ background: "var(--success)", color: "var(--success)" }} />}</span>} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
      <ConfirmDialog open={removeId != null} onClose={() => setRemoveId(null)} title="Remove channel?" body="This removes the channel from TeleFetch Studio only. It does not leave the channel on Telegram or delete downloaded files." confirmLabel="Remove" danger onConfirm={() => removeId != null && void api("/api/channels", { action: "remove", id: removeId })} />
    </div>
  );
}
