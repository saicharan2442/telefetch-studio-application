/**
 * History scanner + media extraction. Runs in the Node process off the request path;
 * progress is polled by the UI.
 */
import { Api } from "telegram";
import { db } from "@/db";
import { ensureAuthorizedClient, getInputPeer } from "./client";
import { evaluateFile, type FilterConfig } from "../filters";
import { resolveDestinationDir, sanitizeFileName } from "../paths";
import { getSettings, logActivity } from "../settings";

export interface MediaInfo {
  fileName: string | null;
  mimeType: string | null;
  size: number;
  caption: string | null;
  date: Date;
  fileUniqueKey: string;
}

export function extractMedia(msg: Api.Message): MediaInfo | null {
  const media = msg.media;
  if (!media) return null;
  const date = new Date(msg.date * 1000);
  const caption = msg.message || null;
  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const doc = media.document;
    let fileName: string | null = null;
    for (const attr of doc.attributes) {
      if (attr instanceof Api.DocumentAttributeFilename) fileName = attr.fileName;
    }
    if (!fileName) {
      const ext = (doc.mimeType.split("/")[1] || "bin").split(";")[0];
      const hasVideo = doc.attributes.some((a) => a instanceof Api.DocumentAttributeVideo);
      const hasAudio = doc.attributes.some((a) => a instanceof Api.DocumentAttributeAudio);
      fileName = `${hasVideo ? "video" : hasAudio ? "audio" : "file"}_${msg.id}.${ext === "quicktime" ? "mov" : ext === "mpeg" ? "mp3" : ext}`;
    }
    return { fileName, mimeType: doc.mimeType, size: Number(doc.size), caption, date, fileUniqueKey: `doc:${doc.id.toString()}` };
  }
  if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) {
    const photo = media.photo;
    let size = 0;
    for (const s of photo.sizes) {
      if (s instanceof Api.PhotoSize) size = Math.max(size, s.size);
      if (s instanceof Api.PhotoSizeProgressive) size = Math.max(size, ...s.sizes);
    }
    return { fileName: `photo_${msg.id}.jpg`, mimeType: "image/jpeg", size, caption, date, fileUniqueKey: `photo:${photo.id.toString()}` };
  }
  return null;
}

export interface ScanResultItem {
  channelTelegramId: string;
  channelTitle: string;
  messageId: number;
  fileName: string;
  mimeType: string | null;
  size: number;
  caption: string | null;
  date: string;
  matchedKeywords: string[];
  destinationDir: string;
  alreadyDownloaded: boolean;
  queued: boolean;
}

export interface ScanState {
  running: boolean;
  cancelled: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  channelsTotal: number;
  channelsDone: number;
  currentChannel: string | null;
  messagesExamined: number;
  mediaSeen: number;
  matches: number;
  totalEstimate: number | null;
  results: ScanResultItem[];
  error: string | null;
}

const g = globalThis as typeof globalThis & { __telefetchScan?: ScanState };
export const scanState: ScanState =
  g.__telefetchScan ??
  (g.__telefetchScan = {
    running: false,
    cancelled: false,
    startedAt: null,
    finishedAt: null,
    channelsTotal: 0,
    channelsDone: 0,
    currentChannel: null,
    messagesExamined: 0,
    mediaSeen: 0,
    matches: 0,
    totalEstimate: null,
    results: [],
    error: null,
  });

export function cancelScan() {
  if (scanState.running) scanState.cancelled = true;
}

export async function startScan(channelIds: number[], filter: FilterConfig): Promise<void> {
  if (scanState.running) throw new Error("A scan is already running");
  const client = await ensureAuthorizedClient();
  const settingsNow = await getSettings();
  await db.load();
  const targets = channelIds.length
    ? db.dataRef.channels.filter((c) => c.selected)
    : [];
  const picked = targets.filter((c) => channelIds.includes(c.id));
  if (picked.length === 0) throw new Error("Select at least one channel to scan");

  Object.assign(scanState, {
    running: true,
    cancelled: false,
    startedAt: Date.now(),
    finishedAt: null,
    channelsTotal: picked.length,
    channelsDone: 0,
    currentChannel: null,
    messagesExamined: 0,
    mediaSeen: 0,
    matches: 0,
    totalEstimate: null,
    results: [],
    error: null,
  } satisfies Partial<ScanState>);

  await db.load();
  const doneSet = new Set(db.dataRef.dedupRecords.map((r) => `${r.channelTelegramId}:${r.messageId}`));
  const queuedSet = new Set(db.dataRef.downloadTasks.map((r) => `${r.channelTelegramId}:${r.messageId}`));

  void (async () => {
    try {
      await logActivity("scan", `History scan started on ${picked.length} channel(s)`);
      for (const ch of picked) {
        if (scanState.cancelled) break;
        scanState.currentChannel = ch.title;
        const peer = await getInputPeer(ch.telegramId, ch.accessHash);
        try {
          const total = await client.getMessages(peer, { limit: 0 });
          scanState.totalEstimate = (scanState.totalEstimate ?? 0) + (total.total ?? 0);
        } catch {
          /* estimate unavailable */
        }
        const iterParams: Record<string, unknown> = { limit: undefined, waitTime: 1 };
        if (filter.dateTo) {
          const to = new Date(filter.dateTo);
          to.setHours(23, 59, 59, 999);
          iterParams.offsetDate = Math.floor(to.getTime() / 1000) + 1;
        }
        const fromTs = filter.dateFrom ? new Date(filter.dateFrom).setHours(0, 0, 0, 0) : null;

        for await (const raw of client.iterMessages(peer, iterParams)) {
          if (scanState.cancelled) break;
          const msg = raw as Api.Message;
          scanState.messagesExamined++;
          if (fromTs && msg.date * 1000 < fromTs) break; // messages are newest-first
          const media = extractMedia(msg);
          if (!media) continue;
          scanState.mediaSeen++;
          const ev = evaluateFile({ fileName: media.fileName, caption: media.caption, size: media.size, date: media.date, mimeType: media.mimeType }, filter);
          if (!ev.matched) continue;
          const keyword = ev.matchedKeywords[0] ?? null;
          const destinationDir = resolveDestinationDir({
            baseDir: settingsNow.destinationDir,
            keyword,
            channelTitle: ch.title,
            messageDate: media.date,
            fallbackFolder: settingsNow.fallbackFolder,
            channelSubfolders: settingsNow.channelSubfolders,
            dateSubfolders: settingsNow.dateSubfolders,
          });
          const key = `${ch.telegramId}:${msg.id}`;
          scanState.matches++;
          scanState.results.push({
            channelTelegramId: ch.telegramId,
            channelTitle: ch.title,
            messageId: msg.id,
            fileName: sanitizeFileName(media.fileName),
            mimeType: media.mimeType,
            size: media.size,
            caption: media.caption ? media.caption.slice(0, 200) : null,
            date: media.date.toISOString(),
            matchedKeywords: ev.matchedKeywords,
            destinationDir,
            alreadyDownloaded: doneSet.has(key),
            queued: queuedSet.has(key),
          });
        }
        scanState.channelsDone++;
        scanState.channelsDone++;
        await db.load();
        const c = db.dataRef.channels.find(x => x.id === ch.id);
        if (c) c.lastScannedAt = new Date().toISOString();
        await db.save();
      }
      await logActivity(
        "scan",
        scanState.cancelled
          ? `Scan cancelled after ${scanState.messagesExamined} messages (${scanState.matches} matches)`
          : `Scan finished: ${scanState.messagesExamined} messages examined, ${scanState.matches} matching files`,
        scanState.cancelled ? "warning" : "success",
      );
    } catch (e) {
      scanState.error = e instanceof Error ? e.message : String(e);
      await logActivity("scan", `Scan failed: ${scanState.error}`, "error");
    } finally {
      scanState.running = false;
      scanState.finishedAt = Date.now();
      scanState.currentChannel = null;
    }
  })();
}

export interface EnqueueInput {
  channelTelegramId: string;
  channelTitle: string;
  messageId: number;
  fileName: string;
  mimeType: string | null;
  size: number;
  matchedKeyword: string | null;
  destinationDir: string;
  messageDate: string | null;
  source: "scan" | "monitor";
}

/** Enqueue tasks, skipping duplicates by (channel, message) and by dedup history. Returns counts. */
export async function enqueueTasks(items: EnqueueInput[]): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  await db.load();
  for (const it of items) {
    const isDup = db.dataRef.dedupRecords.some(r => r.channelTelegramId === it.channelTelegramId && r.messageId === it.messageId);
    if (isDup) {
      skipped++;
      continue;
    }
    const isQueued = db.dataRef.downloadTasks.some(r => r.channelTelegramId === it.channelTelegramId && r.messageId === it.messageId);
    if (isQueued) {
      skipped++;
      continue;
    }
    
    const id = (db.dataRef.downloadTasks.length > 0 ? Math.max(...db.dataRef.downloadTasks.map(x => x.id)) : 0) + 1;
    db.dataRef.downloadTasks.push({
      id,
      channelTelegramId: it.channelTelegramId,
      channelTitle: it.channelTitle,
      messageId: it.messageId,
      fileName: it.fileName,
      mimeType: it.mimeType,
      size: it.size,
      matchedKeyword: it.matchedKeyword,
      destinationDir: it.destinationDir,
      finalPath: null,
      status: "queued",
      progress: 0,
      downloadedBytes: 0,
      attempts: 0,
      error: null,
      source: it.source,
      messageDate: it.messageDate || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    added++;
  }
  await db.save();
  if (added) await logActivity("queue", `${added} file(s) added to the download queue${skipped ? ` (${skipped} duplicates skipped)` : ""}`);
  return { added, skipped };
}
