"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/components/store";
import { TaskRow } from "@/components/task-row";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getExtension } from "@/lib/filters";

function CompletedInner() {
  const { state } = useStore();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [channel, setChannel] = useState("");
  const [keyword, setKeyword] = useState("");
  const [ext, setExt] = useState("");
  const [date, setDate] = useState("");

  const done = useMemo(() => (state?.tasks ?? []).filter((t) => t.status === "completed"), [state]);
  const channels = Array.from(new Set(done.map((t) => t.channelTitle)));
  const keywords = Array.from(new Set(done.map((t) => t.matchedKeyword).filter(Boolean))) as string[];
  const exts = Array.from(new Set(done.map((t) => getExtension(t.fileName)).filter(Boolean)));
  const list = done.filter((t) =>
    (!q || t.fileName.toLowerCase().includes(q.toLowerCase()) || t.channelTitle.toLowerCase().includes(q.toLowerCase())) &&
    (!channel || t.channelTitle === channel) && (!keyword || t.matchedKeyword === keyword) && (!ext || getExtension(t.fileName) === ext) &&
    (!date || new Date(t.updatedAt).toISOString().slice(0, 10) === date),
  );
  if (!state) return <div className="skeleton h-64" />;
  return (
    <div className="space-y-6">
      <PageHeader title="Completed Downloads" subtitle={`${done.length} files verified on disk`} />
      <Card>
        <div className="grid gap-3 md:grid-cols-5">
          <input className="input" placeholder="Search filename…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">All channels</option>{channels.map((c) => <option key={c}>{c}</option>)}</select>
          <select className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)}><option value="">All keywords</option>{keywords.map((c) => <option key={c}>{c}</option>)}</select>
          <select className="input" value={ext} onChange={(e) => setExt(e.target.value)}><option value="">All types</option>{exts.map((c) => <option key={c} value={c}>.{c}</option>)}</select>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </Card>
      {list.length === 0 ? <Card><EmptyState icon="✓" title="No completed downloads" body={done.length ? "No files match these filters." : "Files will appear here once they finish and are verified."} /></Card> : <div className="space-y-2">{list.map((t) => <TaskRow key={t.id} t={t} />)}</div>}
    </div>
  );
}

export default function CompletedPage() {
  return <Suspense fallback={<div className="skeleton h-64" />}><CompletedInner /></Suspense>;
}
