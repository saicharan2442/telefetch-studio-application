import QRCode from "qrcode";

/** Render a QR code as an inline SVG string (offline, no external services). */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#0b0f1a", light: "#ffffff" } });
}
