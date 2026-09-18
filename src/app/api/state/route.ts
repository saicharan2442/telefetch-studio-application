import { db } from "@/db";
import { bootstrap, ok, fail } from "@/lib/api";
import { getState } from "@/lib/telegram/client";
import { liveMetrics, isGlobalPaused } from "@/lib/telegram/downloader";
import { monitorState } from "@/lib/telegram/monitor";
import { scanState } from "@/lib/telegram/scanner";
import { getSettings, recentActivity } from "@/lib/settings";
import { checkDestination } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await bootstrap();
    await db.load();
    const d = db.dataRef;

    const settings = await getSettings();
    const activity = await recentActivity(80);

    const chans = [...d.channels].sort((a, b) => a.title.localeCompare(b.title));
    const tasks = [...d.downloadTasks].sort((a, b) => b.id - a.id).slice(0, 500);

    const stats: Record<string, number> = {};
    for (const t of d.downloadTasks) {
      stats[t.status] = (stats[t.status] || 0) + 1;
    }

    const completedHistory = d.downloadHistory.filter((h) => h.status === 'completed');
    const totalBytes = completedHistory.reduce((acc, h) => acc + h.size, 0);
    const totalCompleted = completedHistory.length;

    const dest = await checkDestination(settings.destinationDir, false);
    return ok({
      connection: getState(),
      settings,
      activity,
      channels: chans,
      tasks,
      metrics: liveMetrics(),
      queuePaused: isGlobalPaused(),
      stats: { ...stats, totalBytes, totalCompleted },
      monitor: monitorState(),
      scan: { ...scanState, results: scanState.results.length },
      destination: dest,
      now: Date.now(),
    });
  } catch (e) {
    return fail(e, 500);
  }
}
