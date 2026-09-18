import { db } from "@/db";
import { defaultDownloadsDir, type CollisionPolicy } from "./paths";
import { DEFAULT_FILTER, type FilterConfig } from "./filters";

export interface AppSettings {
  destinationDir: string;
  destinationConfirmed: boolean;
  fallbackFolder: string;
  channelSubfolders: boolean;
  dateSubfolders: boolean;
  concurrency: number;
  collisionPolicy: CollisionPolicy;
  maxRetries: number;
  notifications: boolean;
  theme: "dark" | "light";
  autoDownloadOnMonitor: boolean;
  activeFilter: FilterConfig;
  monitoringEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  destinationDir: defaultDownloadsDir(),
  destinationConfirmed: false,
  fallbackFolder: "Telegram_Downloads",
  channelSubfolders: false,
  dateSubfolders: false,
  concurrency: 2,
  collisionPolicy: "rename",
  maxRetries: 3,
  notifications: true,
  theme: "dark",
  autoDownloadOnMonitor: true,
  activeFilter: DEFAULT_FILTER,
  monitoringEnabled: false,
};

export const MAX_CONCURRENCY = 4;

export async function getSettings(): Promise<AppSettings> {
  await db.load();
  const rows = db.dataRef.settings;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  const s = out as unknown as AppSettings;
  s.concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, Number(s.concurrency) || 2));
  s.activeFilter = { ...DEFAULT_FILTER, ...(s.activeFilter ?? {}) };
  return s;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  await db.load();
  const d = db.dataRef;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existingIndex = d.settings.findIndex((s) => s.key === key);
    if (existingIndex >= 0) {
      d.settings[existingIndex].value = value;
      d.settings[existingIndex].updatedAt = new Date().toISOString();
    } else {
      d.settings.push({ key, value, updatedAt: new Date().toISOString() });
    }
  }
  await db.save();
  return getSettings();
}

export type ActivityLevel = "info" | "success" | "warning" | "error";

export async function logActivity(kind: string, message: string, level: ActivityLevel = "info", meta?: Record<string, unknown>) {
  try {
    await db.load();
    const d = db.dataRef;
    const id = (d.activityEvents.length > 0 ? Math.max(...d.activityEvents.map((a) => a.id)) : 0) + 1;
    d.activityEvents.push({ id, kind, message, level, meta: meta ?? null, createdAt: new Date().toISOString() });
    await db.save();
  } catch (e) {
    console.error("[activity] failed to persist", e);
  }
  const line = `[${new Date().toISOString()}] [${level}] [${kind}] ${message}`;
  if (level === "error") console.error(line);
  else console.log(line);
}

export async function recentActivity(limit = 60) {
  await db.load();
  const sorted = [...db.dataRef.activityEvents].sort((a, b) => b.id - a.id);
  return sorted.slice(0, limit);
}

export async function clearActivity() {
  await db.load();
  db.dataRef.activityEvents = [];
  await db.save();
}
