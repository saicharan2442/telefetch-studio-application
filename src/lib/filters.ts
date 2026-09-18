/**
 * Filter engine — pure functions, no Telegram or IO dependencies.
 */

export type MatchMode = "any" | "all";

export interface FilterConfig {
  includeKeywords: string[];
  excludeKeywords: string[];
  matchMode: MatchMode;
  matchFilename: boolean;
  matchCaption: boolean;
  extensions: string[]; // lower-case, without dot. Empty = all
  minSizeBytes: number | null;
  maxSizeBytes: number | null;
  dateFrom: string | null; // ISO date
  dateTo: string | null; // ISO date (inclusive)
}

export interface CandidateFile {
  fileName: string | null;
  caption: string | null;
  size: number;
  date: Date;
  mimeType?: string | null;
}

export interface MatchResult {
  matched: boolean;
  matchedKeywords: string[];
  reason?: string;
}

export const DEFAULT_FILTER: FilterConfig = {
  includeKeywords: [],
  excludeKeywords: [],
  matchMode: "any",
  matchFilename: true,
  matchCaption: true,
  extensions: [],
  minSizeBytes: null,
  maxSizeBytes: null,
  dateFrom: null,
  dateTo: null,
};

export const KNOWN_EXTENSIONS: { group: string; items: string[] }[] = [
  { group: "Documents", items: ["pdf", "docx", "doc", "xlsx", "pptx", "txt", "epub", "csv"] },
  { group: "Archives", items: ["zip", "rar", "7z", "tar", "gz"] },
  { group: "Video", items: ["mp4", "mkv", "avi", "mov", "webm"] },
  { group: "Audio", items: ["mp3", "flac", "m4a", "wav", "ogg"] },
  { group: "Images", items: ["jpg", "jpeg", "png", "gif", "webp", "svg"] },
  { group: "Code & Data", items: ["json", "py", "js", "ipynb", "sql", "apk", "exe", "iso"] },
];

export function parseKeywords(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\n;]/)
        .map((k) => k.trim())
        .filter((k) => k.length > 0),
    ),
  );
}

export function normalizeExtension(ext: string): string {
  return ext.trim().toLowerCase().replace(/^\.+/, "");
}

export function getExtension(fileName: string | null | undefined): string {
  if (!fileName) return "";
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

function textMatches(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

/** Returns which include keywords match according to the configured fields. */
export function matchKeywords(file: CandidateFile, cfg: FilterConfig): string[] {
  const haystacks: string[] = [];
  if (cfg.matchFilename && file.fileName) haystacks.push(file.fileName);
  if (cfg.matchCaption && file.caption) haystacks.push(file.caption);
  if (haystacks.length === 0) return [];
  return cfg.includeKeywords.filter((kw) => haystacks.some((h) => textMatches(h, kw)));
}

export function isExcluded(file: CandidateFile, cfg: FilterConfig): boolean {
  if (cfg.excludeKeywords.length === 0) return false;
  const haystacks: string[] = [];
  if (cfg.matchFilename && file.fileName) haystacks.push(file.fileName);
  if (cfg.matchCaption && file.caption) haystacks.push(file.caption);
  return cfg.excludeKeywords.some((kw) => haystacks.some((h) => textMatches(h, kw)));
}

export function extensionAllowed(file: CandidateFile, cfg: FilterConfig): boolean {
  if (cfg.extensions.length === 0) return true;
  const ext = getExtension(file.fileName);
  if (ext) return cfg.extensions.includes(ext);
  // No filename: fall back to mime type inference
  const mime = (file.mimeType ?? "").toLowerCase();
  const sub = mime.split("/")[1] ?? "";
  return cfg.extensions.some((e) => sub === e || (e === "jpg" && sub === "jpeg"));
}

export function sizeAllowed(file: CandidateFile, cfg: FilterConfig): boolean {
  if (cfg.minSizeBytes != null && file.size < cfg.minSizeBytes) return false;
  if (cfg.maxSizeBytes != null && cfg.maxSizeBytes > 0 && file.size > cfg.maxSizeBytes) return false;
  return true;
}

export function dateAllowed(file: CandidateFile, cfg: FilterConfig): boolean {
  const t = file.date.getTime();
  if (cfg.dateFrom) {
    const from = new Date(cfg.dateFrom);
    from.setHours(0, 0, 0, 0);
    if (t < from.getTime()) return false;
  }
  if (cfg.dateTo) {
    const to = new Date(cfg.dateTo);
    to.setHours(23, 59, 59, 999);
    if (t > to.getTime()) return false;
  }
  return true;
}

export function evaluateFile(file: CandidateFile, cfg: FilterConfig): MatchResult {
  if (!extensionAllowed(file, cfg)) return { matched: false, matchedKeywords: [], reason: "extension" };
  if (!sizeAllowed(file, cfg)) return { matched: false, matchedKeywords: [], reason: "size" };
  if (!dateAllowed(file, cfg)) return { matched: false, matchedKeywords: [], reason: "date" };
  if (isExcluded(file, cfg)) return { matched: false, matchedKeywords: [], reason: "excluded" };

  if (cfg.includeKeywords.length === 0) {
    return { matched: true, matchedKeywords: [] };
  }
  const matched = matchKeywords(file, cfg);
  if (cfg.matchMode === "all") {
    const ok = matched.length === cfg.includeKeywords.length;
    return { matched: ok, matchedKeywords: ok ? matched : [], reason: ok ? undefined : "keywords" };
  }
  return { matched: matched.length > 0, matchedKeywords: matched, reason: matched.length ? undefined : "keywords" };
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}
