/**
 * Real-time monitoring service: subscribes to NewMessage updates for monitored channels,
 * applies the active filter and enqueues matching files. Requires the server to stay running.
 */
import { Api } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events/index.js";
import { db } from "@/db";
import { ensureAuthorizedClient } from "./client";
import { extractMedia, enqueueTasks } from "./scanner";
import { evaluateFile } from "../filters";
import { resolveDestinationDir, sanitizeFileName } from "../paths";
import { getSettings, logActivity, updateSettings } from "../settings";
import { tick } from "./downloader";

export interface MonitorState {
  status: "stopped" | "running" | "paused";
  startedAt: number | null;
  channelIds: string[];
  eventsSeen: number;
  matched: number;
  lastEventAt: number | null;
  recentMatches: { fileName: string; channelTitle: string; keyword: string | null; at: number }[];
}

interface MonGlobal {
  state: MonitorState;
  handler?: (ev: NewMessageEvent) => Promise<void>;
  builder?: NewMessage;
  seen: Set<string>;
}

const g = globalThis as typeof globalThis & { __telefetchMon?: MonGlobal };
const M: MonGlobal =
  g.__telefetchMon ??
  (g.__telefetchMon = {
    state: { status: "stopped", startedAt: null, channelIds: [], eventsSeen: 0, matched: 0, lastEventAt: null, recentMatches: [] },
    seen: new Set(),
  });

export function monitorState(): MonitorState {
  return M.state;
}

export async function startMonitoring(): Promise<MonitorState> {
  const client = await ensureAuthorizedClient();
  await db.load();
  const monitored = db.dataRef.channels.filter(c => c.monitor);
  if (monitored.length === 0) throw new Error("Enable monitoring on at least one channel first");

  // Remove any previous subscription to avoid duplicate handlers
  await stopMonitoring(false);

  const byId = new Map(monitored.map((c) => [c.telegramId, c]));
  const handler = async (event: NewMessageEvent) => {
    if (M.state.status !== "running") return;
    const msg = event.message as Api.Message;
    const peer = msg.peerId;
    let chId: string | null = null;
    if (peer instanceof Api.PeerChannel) chId = peer.channelId.toString();
    else if (peer instanceof Api.PeerChat) chId = peer.chatId.toString();
    if (!chId || !byId.has(chId)) return;
    const dedupKey = `${chId}:${msg.id}`;
    if (M.seen.has(dedupKey)) return;
    M.seen.add(dedupKey);
    if (M.seen.size > 5000) M.seen.clear();

    M.state.eventsSeen++;
    M.state.lastEventAt = Date.now();
    const ch = byId.get(chId)!;
    const media = extractMedia(msg);
    if (!media) {
      await logActivity("monitor", `New post in ${ch.title} (no attachment)`, "info");
      return;
    }
    const settings = await getSettings();
    const ev = evaluateFile({ fileName: media.fileName, caption: media.caption, size: media.size, date: media.date, mimeType: media.mimeType }, settings.activeFilter);
    if (!ev.matched) {
      await logActivity("monitor", `New file in ${ch.title}: ${sanitizeFileName(media.fileName)} — did not match filters`, "info");
      return;
    }
    const keyword = ev.matchedKeywords[0] ?? null;
    M.state.matched++;
    M.state.recentMatches.unshift({ fileName: sanitizeFileName(media.fileName), channelTitle: ch.title, keyword, at: Date.now() });
    M.state.recentMatches = M.state.recentMatches.slice(0, 50);
    await logActivity("monitor", `Matched new file in ${ch.title}: ${sanitizeFileName(media.fileName)}${keyword ? ` (keyword "${keyword}")` : ""}`, "success", {
      channel: ch.title,
      keyword,
    });
    if (!settings.autoDownloadOnMonitor) return;
    const destinationDir = resolveDestinationDir({
      baseDir: settings.destinationDir,
      keyword,
      channelTitle: ch.title,
      messageDate: media.date,
      fallbackFolder: settings.fallbackFolder,
      channelSubfolders: settings.channelSubfolders,
      dateSubfolders: settings.dateSubfolders,
    });
    await enqueueTasks([
      {
        channelTelegramId: chId,
        channelTitle: ch.title,
        messageId: msg.id,
        fileName: sanitizeFileName(media.fileName),
        mimeType: media.mimeType,
        size: media.size,
        matchedKeyword: keyword,
        destinationDir,
        messageDate: media.date.toISOString(),
        source: "monitor",
      },
    ]);
    void tick();
  };

  const builder = new NewMessage({ incoming: true });
  client.addEventHandler(handler, builder);
  M.handler = handler;
  M.builder = builder;
  M.state = {
    status: "running",
    startedAt: Date.now(),
    channelIds: monitored.map((c) => c.telegramId),
    eventsSeen: 0,
    matched: 0,
    lastEventAt: null,
    recentMatches: [],
  };
  await updateSettings({ monitoringEnabled: true });
  await logActivity("monitor", `Monitoring started on ${monitored.length} channel(s)`, "success");
  return M.state;
}

export function pauseMonitoring() {
  if (M.state.status === "running") M.state.status = "paused";
  void logActivity("monitor", "Monitoring paused", "warning");
  return M.state;
}

export function resumeMonitoring() {
  if (M.state.status === "paused") M.state.status = "running";
  void logActivity("monitor", "Monitoring resumed");
  return M.state;
}

export async function stopMonitoring(log = true) {
  if (M.handler && M.builder) {
    try {
      const client = await ensureAuthorizedClient();
      client.removeEventHandler(M.handler, M.builder);
    } catch {
      /* not connected */
    }
  }
  M.handler = undefined;
  M.builder = undefined;
  if (M.state.status !== "stopped") {
    M.state = { ...M.state, status: "stopped" };
    if (log) {
      await updateSettings({ monitoringEnabled: false });
      await logActivity("monitor", "Monitoring stopped");
    }
  }
  return M.state;
}

/** Restore monitoring after a server restart if it was previously enabled. */
export async function autoRestoreMonitoring() {
  try {
    const s = await getSettings();
    if (s.monitoringEnabled && M.state.status === "stopped") await startMonitoring();
  } catch {
    /* not signed in yet */
  }
}
