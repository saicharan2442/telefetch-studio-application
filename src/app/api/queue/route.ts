import { bootstrap, ok, fail, readJson } from "@/lib/api";
import { taskAction, bulkAction, pauseAll, resumeAll, tick } from "@/lib/telegram/downloader";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await bootstrap();
  const body = await readJson<{ action: string; id?: number; taskAction?: "pause" | "resume" | "retry" | "cancel" | "remove"; bulk?: "retryFailed" | "clearFinished" | "cancelAll" }>(req);
  try {
    switch (body.action) {
      case "task":
        await taskAction(body.id!, body.taskAction!);
        return ok({ ok: true });
      case "bulk":
        await bulkAction(body.bulk!);
        return ok({ ok: true });
      case "pauseAll":
        await pauseAll();
        return ok({ ok: true });
      case "resumeAll":
        await resumeAll();
        return ok({ ok: true });
      case "kick":
        void tick();
        return ok({ ok: true });
      default:
        return fail(new Error("Unknown action"));
    }
  } catch (e) {
    return fail(e);
  }
}
