import { describe, it, expect } from "vitest";
import { Api } from "telegram";
import bigInt from "big-integer";
import { extractMedia } from "@/lib/telegram/scanner";

/** Build a mocked Telegram message with a document attachment — no network required. */
function docMessage(fileName: string | null, mime = "application/pdf", size = 1234, caption = "cap") {
  const attributes: Api.TypeDocumentAttribute[] = fileName ? [new Api.DocumentAttributeFilename({ fileName })] : [new Api.DocumentAttributeVideo({ duration: 1, w: 1, h: 1 })];
  const document = new Api.Document({ id: bigInt(42), accessHash: bigInt(1), fileReference: Buffer.alloc(0), date: 1700000000, mimeType: mime, size: bigInt(size), dcId: 2, attributes });
  return new Api.Message({ id: 7, peerId: new Api.PeerChannel({ channelId: bigInt(100) }), date: 1700000000, message: caption, media: new Api.MessageMediaDocument({ document }) });
}

describe("media extraction (mocked Telegram objects)", () => {
  it("extracts filename, size, mime and caption", () => {
    const m = extractMedia(docMessage("Course.pdf"));
    expect(m).toMatchObject({ fileName: "Course.pdf", size: 1234, mimeType: "application/pdf", caption: "cap", fileUniqueKey: "doc:42" });
    expect(m!.date.getTime()).toBe(1700000000 * 1000);
  });
  it("synthesizes a name for documents without a filename", () => {
    const m = extractMedia(docMessage(null, "video/mp4"));
    expect(m!.fileName).toBe("video_7.mp4");
  });
  it("returns null for messages without media", () => {
    const msg = new Api.Message({ id: 1, peerId: new Api.PeerChannel({ channelId: bigInt(1) }), date: 1, message: "hi" });
    expect(extractMedia(msg)).toBeNull();
  });
});
