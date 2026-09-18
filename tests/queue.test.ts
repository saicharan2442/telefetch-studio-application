import { describe, it, expect } from "vitest";
import { canTransition, TRANSITIONS, type TaskStatus } from "@/lib/telegram/downloader";

describe("queue state machine", () => {
  it("allows the documented transitions", () => {
    expect(canTransition("queued", "downloading")).toBe(true);
    expect(canTransition("downloading", "paused")).toBe(true);
    expect(canTransition("paused", "queued")).toBe(true); // resume
    expect(canTransition("failed", "queued")).toBe(true); // retry
    expect(canTransition("cancelled", "queued")).toBe(true); // retry after cancel
    expect(canTransition("downloading", "completed")).toBe(true);
  });
  it("forbids invalid transitions", () => {
    expect(canTransition("completed", "queued")).toBe(false);
    expect(canTransition("completed", "downloading")).toBe(false);
    expect(canTransition("queued", "completed")).toBe(false); // must go through downloading
    expect(canTransition("paused", "downloading")).toBe(false); // must be re-queued first
  });
  it("every status is covered", () => {
    const all: TaskStatus[] = ["queued", "downloading", "paused", "completed", "failed", "cancelled", "skipped"];
    for (const s of all) expect(Array.isArray(TRANSITIONS[s])).toBe(true);
  });
});
