import { NextResponse } from "next/server";
import { ensureScheduler } from "./telegram/downloader";
import { autoRestoreMonitoring } from "./telegram/monitor";
import { getClient, getCredentials } from "./telegram/client";

const g = globalThis as typeof globalThis & { __telefetchBooted?: boolean };

/** Boot background services exactly once per process. */
export async function bootstrap() {
  if (g.__telefetchBooted) return;
  g.__telefetchBooted = true;
  ensureScheduler();
  if (getCredentials()) {
    // Connect in background; restore monitoring if it was on.
    getClient()
      .then(() => autoRestoreMonitoring())
      .catch((e) => console.error("[telegram] connect failed:", e instanceof Error ? e.message : e));
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(e: unknown, status = 400) {
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
