import fs from "node:fs";
import path from "node:path";
import fsp from "node:fs/promises";
import { Api } from "telegram";
import { db, DownloadTask } from "@/db";
import { ensureAuthorizedClient, getInputPeer, getState } from "./client";
import { checkDestination, hasEnoughSpace, resolveCollision } from "../paths";
import { getSettings, logActivity } from "../settings";

export type TaskStatus = "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled" | "skipped";

export const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ["downloading", "paused", "cancelled"],
  downloading: ["completed", "failed", "cancelled", "paused", "skipped"],
  paused: ["queued", "cancelled"],
  failed: ["queued", "cancelled"],
  cancelled: ["queued"],
  completed: [],
  skipped: ["queued"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface LiveMetric {
  downloaded: number;
  total: number;
  speedBps: number;
  etaSec: number | null;
  startedAt: number;
  lastTick: number;
  lastBytes: number;
}

interface QueueGlobal {
  active: Map<number, { cancel: () => void; metric: LiveMetric }>;
  paused: boolean;
  ticking: boolean;
  timer?: NodeJS.Timeout;
}

const g = globalThis as typeof globalThis & { __telefetchQueue?: QueueGlobal };
const Q: QueueGlobal = g.__telefetchQueue ?? (g.__telefetchQueue = { active: new Map(), paused: false, ticking: false });

class CancelledError extends Error {
  constructor(public reason: "cancel" | "pause") {
    super(reason);
  }
}

export function liveMetrics(): Record<number, LiveMetric> {
  const out: Record<number, LiveMetric> = {};
  for (const [id, a] of Q.active) out[id] = a.metric;
  return out;
}

export function isGlobalPaused() {
  return Q.paused;
}

export async function pauseAll() {
  Q.paused = true;
  for (const [, a] of Q.active) a.cancel();
  
  await db.load();
  let changed = false;
  for (const t of db.dataRef.downloadTasks) {
    if (t.status === "queued") {
      t.status = "paused";
      t.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) await db.save();
  
  await logActivity("queue", "Queue paused", "warning");
}

export async function resumeAll() {
  Q.paused = false;
  
  await db.load();
  let changed = false;
  for (const t of db.dataRef.downloadTasks) {
    if (t.status === "paused") {
      t.status = "queued";
      t.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) await db.save();
  
  await logActivity("queue", "Queue resumed");
  void tick();
}

export async function taskAction(id: number, action: "pause" | "resume" | "retry" | "cancel" | "remove") {
  await db.load();
  const task = db.dataRef.downloadTasks.find(t => t.id === id);
  if (!task) throw new Error("Task not found");
  const status = task.status as TaskStatus;

  const set = async (s: TaskStatus, extra: Partial<DownloadTask> = {}) => {
    Object.assign(task, { status: s, updatedAt: new Date().toISOString(), ...extra });
    await db.save();
  };

  switch (action) {
    case "pause":
      if (status === "downloading") Q.active.get(id)?.cancel(); // worker will set paused
      else if (canTransition(status, "paused")) await set("paused");
      break;
    case "resume":
    case "retry":
      if (canTransition(status, "queued")) await set("queued", { error: null, progress: status === "completed" ? task.progress : 0, downloadedBytes: 0 });
      break;
    case "cancel":
      if (status === "downloading") {
        const a = Q.active.get(id);
        if (a) {
          (a as { cancelReason?: string }).cancelReason = "cancel";
          a.cancel();
        }
      } else if (canTransition(status, "cancelled")) await set("cancelled");
      break;
    case "remove":
      if (status === "downloading") Q.active.get(id)?.cancel();
      db.dataRef.downloadTasks = db.dataRef.downloadTasks.filter(t => t.id !== id);
      await db.save();
      break;
  }
  void tick();
}

export async function bulkAction(action: "retryFailed" | "clearFinished" | "cancelAll") {
  await db.load();
  let changed = false;
  const tasks = db.dataRef.downloadTasks;

  if (action === "retryFailed") {
    for (const t of tasks) {
      if (t.status === "failed" || t.status === "cancelled") {
        t.status = "queued";
        t.error = null;
        t.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
  } else if (action === "clearFinished") {
    db.dataRef.downloadTasks = tasks.filter(t => !["completed", "skipped", "cancelled"].includes(t.status));
    changed = true;
  } else if (action === "cancelAll") {
    for (const [, a] of Q.active) a.cancel();
    for (const t of tasks) {
      if (t.status === "queued" || t.status === "paused") {
        t.status = "cancelled";
        t.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
  }

  if (changed) await db.save();
  void tick();
}

/** Recover tasks left "downloading" by a previous process. Call on startup. */
export async function recoverInterrupted() {
  await db.load();
  let recovered = 0;
  for (const t of db.dataRef.downloadTasks) {
    if (t.status === "downloading") {
      t.status = "queued";
      t.downloadedBytes = 0;
      t.progress = 0;
      t.updatedAt = new Date().toISOString();
      recovered++;
    }
  }
  if (recovered > 0) {
    await db.save();
    await logActivity("queue", `Recovered ${recovered} interrupted download(s) — re-queued`, "warning");
  }
}

/** Scheduler tick: start workers up to the concurrency limit. Idempotent. */
export async function tick() {
  if (Q.ticking) return;
  Q.ticking = true;
  try {
    if (Q.paused) return;
    if (getState().stage !== "authorized") return;
    const settings = await getSettings();
    const free = settings.concurrency - Q.active.size;
    if (free <= 0) return;

    await db.load();
    const queuedTasks = db.dataRef.downloadTasks
      .filter(t => t.status === "queued")
      .sort((a, b) => a.id - b.id)
      .slice(0, free);

    for (const t of queuedTasks) {
      if (Q.active.has(t.id)) continue;
      
      t.status = "downloading";
      t.attempts++;
      t.updatedAt = new Date().toISOString();
      await db.save();

      void runTask({ ...t }, settings.collisionPolicy, settings.maxRetries).finally(() => {
        Q.active.delete(t.id);
        setTimeout(() => void tick(), 250);
      });
    }
  } catch (e) {
    console.error("[queue] tick error", e);
  } finally {
    Q.ticking = false;
  }
}

/** Keep the scheduler alive while the server runs. */
export function ensureScheduler() {
  if (Q.timer) return;
  Q.timer = setInterval(() => void tick(), 4000);
  void recoverInterrupted().then(() => tick());
}

async function runTask(task: DownloadTask, policy: "skip" | "rename" | "replace", maxRetries: number) {
  const metric: LiveMetric = { downloaded: 0, total: task.size, speedBps: 0, etaSec: null, startedAt: Date.now(), lastTick: Date.now(), lastBytes: 0 };
  let cancelReason: "cancel" | "pause" = "pause";
  const handle = {
    metric,
    cancelled: false,
    cancel() {
      this.cancelled = true;
    },
  };
  Object.defineProperty(handle, "cancelReason", { set: (v: "cancel" | "pause") => (cancelReason = v) });
  Q.active.set(task.id, handle);

  const finish = async (status: TaskStatus, extra: Partial<DownloadTask> = {}) => {
    await db.load();
    const t = db.dataRef.downloadTasks.find(x => x.id === task.id);
    if (t) {
      Object.assign(t, { status, updatedAt: new Date().toISOString(), ...extra });
      await db.save();
    }
  };

  const record = async (status: string, destination: string, error?: string) => {
    await db.load();
    const d = db.dataRef;
    const id = (d.downloadHistory.length > 0 ? Math.max(...d.downloadHistory.map(x => x.id)) : 0) + 1;
    d.downloadHistory.push({
      id,
      taskId: task.id,
      channelTitle: task.channelTitle,
      channelTelegramId: task.channelTelegramId,
      messageId: task.messageId,
      fileName: task.fileName,
      size: task.size,
      matchedKeyword: task.matchedKeyword,
      destination,
      status,
      error: error ?? null,
      completedAt: new Date().toISOString()
    });
    await db.save();
  };

  let partPath: string | null = null;
  try {
    const dest = await checkDestination(task.destinationDir, true);
    if (!dest.ok) throw new Error(`Destination unavailable: ${dest.error ?? dest.path}`);
    if (!hasEnoughSpace(dest.freeBytes, task.size)) {
      throw new Error(`Insufficient disk space in ${dest.path}`);
    }
    const collision = resolveCollision(task.destinationDir, task.fileName, policy);
    if (collision.action === "skip") {
      await finish("skipped", { finalPath: collision.path, progress: 100, error: "File already exists (skip policy)" });
      await record("skipped", collision.path, "exists");
      await logActivity("download", `Skipped ${task.fileName} — already exists`, "warning", { taskId: task.id });
      return;
    }
    const finalPath = collision.path;
    partPath = `${finalPath}.telefetch-part`;

    const client = await ensureAuthorizedClient();
    await db.load();
    const ch = db.dataRef.channels.find(c => c.telegramId === task.channelTelegramId);
    const peer = await getInputPeer(task.channelTelegramId, ch?.accessHash ?? null);
    const msgs = await client.getMessages(peer, { ids: [task.messageId] });
    const msg = msgs[0] as Api.Message | undefined;
    if (!msg || !msg.media) throw new Error("Message or media no longer available");

    let lastPersist = 0;
    await client.downloadMedia(msg, {
      outputFile: partPath,
      progressCallback: (downloaded, total) => {
        if (handle.cancelled) throw new CancelledError(cancelReason);
        const d = Number(downloaded);
        const t = Number(total) || task.size;
        const now = Date.now();
        const dt = (now - metric.lastTick) / 1000;
        if (dt >= 0.5) {
          metric.speedBps = (d - metric.lastBytes) / dt;
          metric.lastTick = now;
          metric.lastBytes = d;
          metric.etaSec = metric.speedBps > 0 && t > d ? Math.round((t - d) / metric.speedBps) : null;
        }
        metric.downloaded = d;
        metric.total = t;
        if (now - lastPersist > 1500) {
          lastPersist = now;
          db.load().then(() => {
            const tk = db.dataRef.downloadTasks.find(x => x.id === task.id);
            if (tk) {
              tk.progress = t ? Math.min(99, Math.floor((d / t) * 100)) : 0;
              tk.downloadedBytes = d;
              tk.updatedAt = new Date().toISOString();
              db.save().catch(() => {});
            }
          }).catch(() => {});
        }
      },
    });

    // Verify and atomically complete
    const st = await fsp.stat(partPath);
    if (task.size > 0 && st.size < task.size * 0.98) {
      throw new Error(`Downloaded file is incomplete (${st.size} of ${task.size} bytes)`);
    }
    if (collision.action === "replace") await fsp.rm(finalPath, { force: true });
    await fsp.rename(partPath, finalPath);
    partPath = null;

    await finish("completed", { finalPath, progress: 100, downloadedBytes: st.size, size: st.size, error: null });
    
    await db.load();
    const dedupId = (db.dataRef.dedupRecords.length > 0 ? Math.max(...db.dataRef.dedupRecords.map(x => x.id)) : 0) + 1;
    const fileUniqueKey = `${task.channelTelegramId}:${task.messageId}:${task.size}`;
    if (!db.dataRef.dedupRecords.some(r => r.fileUniqueKey === fileUniqueKey)) {
      db.dataRef.dedupRecords.push({
        id: dedupId,
        channelTelegramId: task.channelTelegramId,
        messageId: task.messageId,
        fileUniqueKey,
        finalPath,
        createdAt: new Date().toISOString()
      });
      await db.save();
    }

    await record("completed", finalPath);
    await logActivity("download", `Completed ${task.fileName}`, "success", { taskId: task.id, path: finalPath, size: st.size });
  } catch (e) {
    if (partPath) await fsp.rm(partPath, { force: true }).catch(() => {});
    if (e instanceof CancelledError) {
      if (e.reason === "pause") {
        await finish("paused", { downloadedBytes: 0, progress: 0 });
        await logActivity("download", `Paused ${task.fileName}`, "warning", { taskId: task.id });
      } else {
        await finish("cancelled", { downloadedBytes: 0, progress: 0 });
        await record("cancelled", task.destinationDir);
        await logActivity("download", `Cancelled ${task.fileName}`, "warning", { taskId: task.id });
      }
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    const flood = /FLOOD_WAIT_(\d+)/.exec(msg);
    const retryable = !/Insufficient disk space|Destination unavailable|no longer available|Not signed in/.test(msg);
    if (retryable && task.attempts < maxRetries) {
      const backoff = flood ? Number(flood[1]) * 1000 : Math.min(60_000, 2_000 * 2 ** (task.attempts - 1));
      await finish("failed", { error: `${msg} — retrying in ${Math.round(backoff / 1000)}s` });
      await logActivity("download", `Failed ${task.fileName}: ${msg}. Retry ${task.attempts}/${maxRetries} in ${Math.round(backoff / 1000)}s`, "warning", { taskId: task.id });
      setTimeout(() => {
        db.load().then(() => {
          const t = db.dataRef.downloadTasks.find(x => x.id === task.id);
          if (t && t.status === "failed") {
            t.status = "queued";
            t.updatedAt = new Date().toISOString();
            db.save().then(() => tick()).catch(() => {});
          }
        }).catch(() => {});
      }, backoff);
    } else {
      await finish("failed", { error: msg });
      await record("failed", task.destinationDir, msg);
      await logActivity("download", `Failed ${task.fileName}: ${msg}`, "error", { taskId: task.id });
    }
  }
}

export async function openPath(target: string, reveal: boolean): Promise<void> {
  const { spawn } = await import("node:child_process");
  const exists = fs.existsSync(target);
  if (!exists) throw new Error("Path does not exist yet");
  const isDir = fs.statSync(target).isDirectory();
  let cmd: string;
  let args: string[];
  if (process.platform === "win32") {
    cmd = "explorer.exe";
    args = reveal && !isDir ? [`/select,${target}`] : [isDir ? target : path.dirname(target)];
  } else if (process.platform === "darwin") {
    cmd = "open";
    args = reveal && !isDir ? ["-R", target] : [isDir ? target : path.dirname(target)];
  } else {
    cmd = "xdg-open";
    args = [isDir ? target : path.dirname(target)];
  }
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}
