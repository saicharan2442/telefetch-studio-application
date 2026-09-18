import { bootstrap, ok, fail, readJson } from "@/lib/api";
import { scanState, startScan, cancelScan, enqueueTasks } from "@/lib/telegram/scanner";
import { updateSettings } from "@/lib/settings";
import { tick } from "@/lib/telegram/downloader";
import type { FilterConfig } from "@/lib/filters";

export const dynamic = "force-dynamic";

export async function GET() {
  await bootstrap();
  return ok(scanState);
}

export async function POST(req: Request) {
  await bootstrap();
  const body = await readJson<{ action: string; channelIds?: number[]; filter?: FilterConfig; keys?: string[] }>(req);
  try {
    switch (body.action) {
      case "start":
        if (body.filter) await updateSettings({ activeFilter: body.filter });
        await startScan(body.channelIds ?? [], body.filter!);
        return ok(scanState);
      case "cancel":
        cancelScan();
        return ok(scanState);
      case "enqueue": {
        const keys = new Set(body.keys ?? []);
        const picked = scanState.results.filter((r) => keys.size === 0 || keys.has(`${r.channelTelegramId}:${r.messageId}`));
        const res = await enqueueTasks(
          picked.map((r) => ({
            channelTelegramId: r.channelTelegramId,
            channelTitle: r.channelTitle,
            messageId: r.messageId,
            fileName: r.fileName,
            mimeType: r.mimeType,
            size: r.size,
            matchedKeyword: r.matchedKeywords[0] ?? null,
            destinationDir: r.destinationDir,
            messageDate: r.date,
            source: "scan" as const,
          })),
        );
        for (const r of picked) r.queued = true;
        void tick();
        return ok(res);
      }
      default:
        return fail(new Error("Unknown action"));
    }
  } catch (e) {
    return fail(e);
  }
}
