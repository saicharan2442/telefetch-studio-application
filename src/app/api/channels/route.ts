import { db, Channel } from "@/db";
import { bootstrap, ok, fail, readJson } from "@/lib/api";
import { listDialogChannels, resolveChannelLink, type DiscoveredChannel } from "@/lib/telegram/client";
import { logActivity } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  await bootstrap();
  await db.load();
  const chans = [...db.dataRef.channels].sort((a, b) => a.title.localeCompare(b.title));
  return ok(chans);
}

async function upsert(c: DiscoveredChannel, selected = true) {
  await db.load();
  const d = db.dataRef;
  const existing = d.channels.find(ch => ch.telegramId === c.telegramId);
  if (existing) {
    existing.title = c.title;
    existing.username = c.username || null;
    existing.accessHash = c.accessHash || null;
    existing.participants = c.participants || null;
    existing.selected = selected;
    await db.save();
    return existing;
  }
  const id = (d.channels.length > 0 ? Math.max(...d.channels.map(x => x.id)) : 0) + 1;
  const row: Channel = {
    id,
    telegramId: c.telegramId,
    accessHash: c.accessHash || null,
    title: c.title,
    username: c.username || null,
    kind: c.kind,
    participants: c.participants || null,
    selected,
    monitor: false,
    lastScannedAt: null,
    createdAt: new Date().toISOString()
  };
  d.channels.push(row);
  await db.save();
  return row;
}

export async function POST(req: Request) {
  await bootstrap();
  const body = await readJson<{ action: string; query?: string; link?: string; channel?: DiscoveredChannel; id?: number; value?: boolean }>(req);
  try {
    switch (body.action) {
      case "search":
        return ok(await listDialogChannels(body.query ?? ""));
      case "resolve":
        return ok(await resolveChannelLink(body.link ?? ""));
      case "add": {
        if (!body.channel) throw new Error("Missing channel");
        const row = await upsert(body.channel, true);
        await logActivity("channels", `Added channel ${row.title}`);
        return ok(row);
      }
      case "select": {
        await db.load();
        const ch = db.dataRef.channels.find(c => c.id === body.id);
        if (ch) { ch.selected = !!body.value; await db.save(); }
        return ok({ ok: true });
      }
      case "monitor": {
        await db.load();
        const ch = db.dataRef.channels.find(c => c.id === body.id);
        if (ch) { ch.monitor = !!body.value; await db.save(); }
        return ok({ ok: true });
      }
      case "remove": {
        await db.load();
        db.dataRef.channels = db.dataRef.channels.filter(c => c.id !== body.id);
        await db.save();
        return ok({ ok: true });
      }
      default:
        return fail(new Error("Unknown action"));
    }
  } catch (e) {
    return fail(e);
  }
}
