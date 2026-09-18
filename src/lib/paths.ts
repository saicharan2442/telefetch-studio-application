/**
 * Destination & file-organization service. Pure path logic + small fs helpers.
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";

const WINDOWS_RESERVED = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

// eslint-disable-next-line no-control-regex
const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export const FALLBACK_FOLDER = "Telegram_Downloads";

/** Sanitize a single path segment (folder or file name) for Windows/macOS/Linux. */
export function sanitizeSegment(name: string | null | undefined, fallback = FALLBACK_FOLDER, maxLen = 120): string {
  let s = (name ?? "").normalize("NFC").replace(INVALID_CHARS, "_");
  s = s.replace(/\.{2,}/g, ".").trim();
  s = s.replace(/^[.\s]+|[.\s]+$/g, ""); // no leading/trailing dots or spaces
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  if (!s) return fallback;
  const stem = s.split(".")[0].toUpperCase();
  if (WINDOWS_RESERVED.has(stem)) s = `_${s}`;
  return s;
}

/** Sanitize a file name, preserving extension where possible. */
export function sanitizeFileName(name: string | null | undefined, fallbackBase = "file"): string {
  const raw = (name ?? "").trim();
  if (!raw) return fallbackBase;
  const base = path.basename(raw.replace(/\\/g, "/"));
  const idx = base.lastIndexOf(".");
  if (idx > 0 && idx < base.length - 1) {
    const stem = sanitizeSegment(base.slice(0, idx), fallbackBase, 150);
    const ext = sanitizeSegment(base.slice(idx + 1), "bin", 16);
    return `${stem}.${ext}`;
  }
  return sanitizeSegment(base, fallbackBase, 160);
}

/** Resolve the OS Downloads folder without hardcoding a username. */
export function defaultDownloadsDir(): string {
  const home = os.homedir();
  if (process.platform === "win32") {
    const userProfile = process.env.USERPROFILE || home;
    return path.join(userProfile, "Downloads");
  }
  const xdg = process.env.XDG_DOWNLOAD_DIR;
  if (xdg && xdg.trim()) return xdg;
  return path.join(home, "Downloads");
}

export function appDataDir(): string {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "TeleFetchStudio");
  }
  const xdg = process.env.XDG_DATA_HOME;
  return path.join(xdg && xdg.trim() ? xdg : path.join(os.homedir(), ".local", "share"), "telefetch-studio");
}

export interface OrganizationOptions {
  baseDir: string;
  keyword: string | null; // first matched keyword according to matching rule
  channelTitle: string;
  messageDate: Date;
  fallbackFolder: string;
  channelSubfolders: boolean;
  dateSubfolders: boolean;
}

/** Ensure a resolved path is inside base (prevents traversal). */
export function isInside(base: string, target: string): boolean {
  const rel = path.relative(path.resolve(base), path.resolve(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Build the destination directory: base / keyword / [channel] / [YYYY-MM]. */
export function resolveDestinationDir(opts: OrganizationOptions): string {
  const base = path.resolve(opts.baseDir);
  const parts: string[] = [];
  const kw = opts.keyword && opts.keyword.trim() ? opts.keyword : opts.fallbackFolder;
  parts.push(sanitizeSegment(kw, FALLBACK_FOLDER));
  if (opts.channelSubfolders) parts.push(sanitizeSegment(opts.channelTitle, "Channel"));
  if (opts.dateSubfolders) {
    const d = opts.messageDate;
    parts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const target = path.join(base, ...parts);
  if (!isInside(base, target)) {
    throw new Error("Resolved destination escapes the base directory");
  }
  return target;
}

export type CollisionPolicy = "skip" | "rename" | "replace";

export interface CollisionResult {
  path: string;
  action: "write" | "skip" | "replace";
}

/** Decide final path given collision policy. */
export function resolveCollision(dir: string, fileName: string, policy: CollisionPolicy, exists: (p: string) => boolean = fs.existsSync): CollisionResult {
  const first = path.join(dir, fileName);
  if (!exists(first)) return { path: first, action: "write" };
  if (policy === "skip") return { path: first, action: "skip" };
  if (policy === "replace") return { path: first, action: "replace" };
  const idx = fileName.lastIndexOf(".");
  const stem = idx > 0 ? fileName.slice(0, idx) : fileName;
  const ext = idx > 0 ? fileName.slice(idx) : "";
  for (let i = 1; i < 10000; i++) {
    const candidate = path.join(dir, `${stem} (${i})${ext}`);
    if (!exists(candidate)) return { path: candidate, action: "write" };
  }
  throw new Error("Could not find a free filename");
}

export interface DestinationCheck {
  ok: boolean;
  path: string;
  exists: boolean;
  writable: boolean;
  freeBytes: number | null;
  error?: string;
}

/** Validate destination: exists (or can be created), writable, free space reported. */
export async function checkDestination(dir: string, createIfMissing = true): Promise<DestinationCheck> {
  const resolved = path.resolve(dir);
  const result: DestinationCheck = { ok: false, path: resolved, exists: false, writable: false, freeBytes: null };
  try {
    const st = await fsp.stat(resolved).catch(() => null);
    if (st && !st.isDirectory()) {
      result.error = "Destination exists but is not a folder";
      return result;
    }
    if (!st) {
      if (!createIfMissing) {
        result.error = "Folder does not exist";
        return result;
      }
      await fsp.mkdir(resolved, { recursive: true });
    }
    result.exists = true;
    await fsp.access(resolved, fs.constants.W_OK);
    result.writable = true;
    try {
      const s = await fsp.statfs(resolved);
      result.freeBytes = Number(s.bavail) * Number(s.bsize);
    } catch {
      result.freeBytes = null;
    }
    result.ok = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}

export const LOW_SPACE_THRESHOLD = 500 * 1024 * 1024; // 500 MB

export function hasEnoughSpace(freeBytes: number | null, needed: number): boolean {
  if (freeBytes == null) return true; // unknown — don't block
  return freeBytes - needed > LOW_SPACE_THRESHOLD / 5;
}
