import { bootstrap, ok, fail, readJson } from "@/lib/api";
import { db } from "@/db";
import { getSettings, updateSettings, type AppSettings, MAX_CONCURRENCY, logActivity, clearActivity } from "@/lib/settings";
import { checkDestination, defaultDownloadsDir } from "@/lib/paths";
import { startMonitoring, pauseMonitoring, resumeMonitoring, stopMonitoring } from "@/lib/telegram/monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  await bootstrap();
  return ok(await getSettings());
}

export async function PUT(req: Request) {
  await bootstrap();
  const patch = await readJson<Partial<AppSettings>>(req);
  try {
    if (patch.concurrency != null) patch.concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, Number(patch.concurrency)));
    if (patch.destinationDir != null) {
      const check = await checkDestination(patch.destinationDir, true);
      if (!check.ok) throw new Error(check.error ?? "Destination is not accessible");
      patch.destinationDir = check.path;
      await logActivity("settings", `Download destination set to ${check.path}`);
    }
    return ok(await updateSettings(patch));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  await bootstrap();
  const body = await readJson<{ action: string; path?: string }>(req);
  try {
    switch (body.action) {
      case "checkDestination":
        return ok(await checkDestination(body.path ?? "", false));
      case "defaultDestination":
        return ok({ path: defaultDownloadsDir() });
      case "monitor-start":
        return ok(await startMonitoring());
      case "monitor-pause":
        return ok(pauseMonitoring());
      case "monitor-resume":
        return ok(resumeMonitoring());
      case "monitor-stop":
        return ok(await stopMonitoring());
      case "clear-logs":
        await clearActivity();
        return ok({});
      default:
        return fail(new Error("Unknown action"));
    }
  } catch (e) {
    return fail(e);
  }
}
