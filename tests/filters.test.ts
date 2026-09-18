import { describe, it, expect } from "vitest";
import { evaluateFile, parseKeywords, getExtension, DEFAULT_FILTER, type FilterConfig, formatBytes } from "@/lib/filters";

const base = (o: Partial<FilterConfig> = {}): FilterConfig => ({ ...DEFAULT_FILTER, ...o });
const file = (o: Partial<{ fileName: string | null; caption: string | null; size: number; date: Date; mimeType: string | null }> = {}) => ({
  fileName: "Python_Course_2024.pdf", caption: "Learn Python fast", size: 5 * 1024 * 1024, date: new Date("2024-06-15T12:00:00Z"), mimeType: "application/pdf", ...o,
});

describe("keyword matching", () => {
  it("parses comma/newline separated keywords and dedupes", () => {
    expect(parseKeywords("python, ML,\n python ;rust")).toEqual(["python", "ML", "rust"]);
  });
  it("matches case-insensitively in filename (ANY)", () => {
    const r = evaluateFile(file(), base({ includeKeywords: ["PYTHON"] }));
    expect(r.matched).toBe(true);
    expect(r.matchedKeywords).toEqual(["PYTHON"]);
  });
  it("respects ALL mode", () => {
    expect(evaluateFile(file(), base({ includeKeywords: ["python", "java"], matchMode: "all" })).matched).toBe(false);
    expect(evaluateFile(file(), base({ includeKeywords: ["python", "course"], matchMode: "all" })).matched).toBe(true);
  });
  it("excludes take precedence", () => {
    const r = evaluateFile(file(), base({ includeKeywords: ["python"], excludeKeywords: ["2024"] }));
    expect(r.matched).toBe(false);
    expect(r.reason).toBe("excluded");
  });
  it("caption toggle controls caption matching", () => {
    const f = file({ fileName: "doc.pdf" });
    expect(evaluateFile(f, base({ includeKeywords: ["learn"], matchCaption: true })).matched).toBe(true);
    expect(evaluateFile(f, base({ includeKeywords: ["learn"], matchCaption: false })).matched).toBe(false);
  });
  it("handles missing filename gracefully", () => {
    const f = file({ fileName: null, caption: null });
    expect(evaluateFile(f, base({ includeKeywords: ["x"] })).matched).toBe(false);
    expect(evaluateFile(f, base()).matched).toBe(true);
  });
  it("reports multiple matched keywords without duplicating file", () => {
    const r = evaluateFile(file(), base({ includeKeywords: ["python", "course"] }));
    expect(r.matchedKeywords).toHaveLength(2);
  });
});

describe("extension / size / date filters", () => {
  it("extension filter", () => {
    expect(getExtension("a.tar.GZ")).toBe("gz");
    expect(getExtension("noext")).toBe("");
    expect(evaluateFile(file(), base({ extensions: ["pdf"] })).matched).toBe(true);
    expect(evaluateFile(file(), base({ extensions: ["zip"] })).reason).toBe("extension");
  });
  it("falls back to mime type when no filename", () => {
    expect(evaluateFile(file({ fileName: null, mimeType: "image/jpeg" }), base({ extensions: ["jpg"] })).matched).toBe(true);
  });
  it("size bounds", () => {
    expect(evaluateFile(file(), base({ minSizeBytes: 10 * 1024 * 1024 })).reason).toBe("size");
    expect(evaluateFile(file(), base({ maxSizeBytes: 1024 })).reason).toBe("size");
    expect(evaluateFile(file(), base({ minSizeBytes: 1024, maxSizeBytes: 10 * 1024 * 1024 })).matched).toBe(true);
  });
  it("date range inclusive", () => {
    expect(evaluateFile(file(), base({ dateFrom: "2024-06-15", dateTo: "2024-06-15" })).matched).toBe(true);
    expect(evaluateFile(file(), base({ dateFrom: "2024-07-01" })).reason).toBe("date");
    expect(evaluateFile(file(), base({ dateTo: "2024-01-01" })).reason).toBe("date");
  });
  it("formats bytes", () => {
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(null)).toBe("—");
  });
});
