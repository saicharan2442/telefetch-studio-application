import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ok, fail, readJson } from "@/lib/api";
import { openPath } from "@/lib/telegram/downloader";

export const dynamic = "force-dynamic";

/** Minimal folder browser + "open in file manager" for the local host. */
export async function POST(req: Request) {
  const body = await readJson<{ action: string; path?: string; reveal?: boolean }>(req);
  try {
    if (body.action === "open") {
      await openPath(body.path ?? "", !!body.reveal);
      return ok({ ok: true });
    }
    if (body.action === "list") {
      const target = path.resolve(body.path && body.path.trim() ? body.path : os.homedir());
      const entries = fs
        .readdirSync(target, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
      const parent = path.dirname(target);
      const roots = process.platform === "win32" ? ["C:\\", "D:\\"].filter((r) => fs.existsSync(r)) : ["/"];
      return ok({ path: target, parent: parent === target ? null : parent, entries, home: os.homedir(), roots });
    }
    return fail(new Error("Unknown action"));
  } catch (e) {
    return fail(e);
  }
}
