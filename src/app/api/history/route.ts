import { db } from "@/db";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  await db.load();
  const rows = [...db.dataRef.downloadHistory].sort((a, b) => b.id - a.id).slice(0, 2000);
  
  if (url.searchParams.get("format") === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["completed_at", "status", "channel", "file_name", "size_bytes", "matched_keyword", "destination", "error"];
    const lines = rows.map((r) =>
      [r.completedAt, r.status, r.channelTitle, r.fileName, r.size, r.matchedKeyword, r.destination, r.error].map(esc).join(","),
    );
    return new Response([header.join(","), ...lines].join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="telefetch-history-${Date.now()}.csv"` },
    });
  }
  return ok(rows);
}

export async function DELETE() {
  await db.load();
  db.dataRef.downloadHistory = [];
  await db.save();
  return ok({ ok: true });
}
