import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { sanitizeSegment, sanitizeFileName, resolveDestinationDir, resolveCollision, checkDestination, defaultDownloadsDir, isInside, hasEnoughSpace } from "@/lib/paths";

describe("sanitization", () => {
  it("removes invalid Windows characters", () => {
    expect(sanitizeSegment('a<b>c:"d/e\\f|g?h*i')).toBe("a_b_c__d_e_f_g_h_i");
  });
  it("handles reserved names, empties, dots and traversal", () => {
    expect(sanitizeSegment("CON")).toBe("_CON");
    expect(sanitizeSegment("com1.txt")).toBe("_com1.txt");
    expect(sanitizeSegment("")).toBe("Telegram_Downloads");
    expect(sanitizeSegment("   ")).toBe("Telegram_Downloads");
    expect(sanitizeSegment("..")).toBe("Telegram_Downloads");
    expect(sanitizeSegment("../../etc")).toBe("_._etc");
    expect(sanitizeSegment("../../etc")).not.toContain("..");
    expect(sanitizeSegment("name. ")).toBe("name");
  });
  it("preserves extension in filenames and strips directories", () => {
    expect(sanitizeFileName("../secret/report:final.pdf")).toBe("report_final.pdf");
    expect(sanitizeFileName(null)).toBe("file");
    expect(sanitizeFileName("a".repeat(300) + ".mp4").length).toBeLessThan(200);
  });
});

describe("destination resolution", () => {
  const base = path.join(os.tmpdir(), "tf-base");
  it("creates keyword subfolder", () => {
    expect(resolveDestinationDir({ baseDir: base, keyword: "Python", channelTitle: "C", messageDate: new Date(), fallbackFolder: "TG", channelSubfolders: false, dateSubfolders: false })).toBe(path.join(base, "Python"));
  });
  it("uses fallback when keyword empty", () => {
    expect(resolveDestinationDir({ baseDir: base, keyword: "", channelTitle: "C", messageDate: new Date(), fallbackFolder: "Telegram_Downloads", channelSubfolders: false, dateSubfolders: false })).toBe(path.join(base, "Telegram_Downloads"));
  });
  it("adds channel and date subfolders and sanitizes", () => {
    const d = resolveDestinationDir({ baseDir: base, keyword: "a/b", channelTitle: "My: Channel", messageDate: new Date("2024-03-05"), fallbackFolder: "x", channelSubfolders: true, dateSubfolders: true });
    expect(d).toBe(path.join(base, "a_b", "My_ Channel", "2024-03"));
    expect(isInside(base, d)).toBe(true);
  });
  it("never escapes the base directory", () => {
    const d = resolveDestinationDir({ baseDir: base, keyword: "../../../etc", channelTitle: "C", messageDate: new Date(), fallbackFolder: "x", channelSubfolders: false, dateSubfolders: false });
    expect(isInside(base, d)).toBe(true);
  });
  it("default downloads folder is under home, not hardcoded", () => {
    expect(defaultDownloadsDir().startsWith(os.homedir()) || !!process.env.XDG_DOWNLOAD_DIR).toBe(true);
  });
});

describe("collision handling", () => {
  const existing = new Set(["/d/a.pdf", "/d/a (1).pdf"]);
  const exists = (p: string) => existing.has(p.replace(/\\/g, "/"));
  it("writes when free", () => expect(resolveCollision("/d", "b.pdf", "rename", exists).action).toBe("write"));
  it("renames with increasing suffix", () => expect(resolveCollision("/d", "a.pdf", "rename", exists).path.replace(/\\/g, "/")).toBe("/d/a (2).pdf"));
  it("skips / replaces per policy", () => {
    expect(resolveCollision("/d", "a.pdf", "skip", exists).action).toBe("skip");
    expect(resolveCollision("/d", "a.pdf", "replace", exists).action).toBe("replace");
  });
});

describe("destination checks", () => {
  it("creates and validates a writable folder", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tf-"));
    const r = await checkDestination(path.join(dir, "nested", "deep"), true);
    expect(r.ok).toBe(true);
    expect(r.writable).toBe(true);
    expect(r.freeBytes === null || r.freeBytes > 0).toBe(true);
  });
  it("rejects a file path and missing folders when not creating", async () => {
    const f = path.join(os.tmpdir(), `tf-file-${Date.now()}`);
    fs.writeFileSync(f, "x");
    expect((await checkDestination(f)).ok).toBe(false);
    expect((await checkDestination(path.join(os.tmpdir(), "tf-nope-" + Date.now()), false)).ok).toBe(false);
  });
  it("rejects inaccessible destinations", async () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return;
    const locked = fs.mkdtempSync(path.join(os.tmpdir(), "tf-locked-"));
    fs.chmodSync(locked, 0o500);
    const r = await checkDestination(path.join(locked, "child"), true);
    fs.chmodSync(locked, 0o700);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
  it("disk space check", () => {
    expect(hasEnoughSpace(null, 1e12)).toBe(true);
    expect(hasEnoughSpace(1e9, 2e9)).toBe(false);
    expect(hasEnoughSpace(10e9, 1e9)).toBe(true);
  });
});
