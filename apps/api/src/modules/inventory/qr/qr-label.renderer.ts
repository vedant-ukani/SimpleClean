import { Injectable } from "@nestjs/common";
import QRCode from "qrcode";

function escapeXml(input: string): string {
  return input.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

export interface RenderedQrLabel {
  svg: string;
  filename: string;
}

@Injectable()
export class QrLabelRenderer {
  async render(input: {
    url: string;
    fallbackCode: string;
  }): Promise<RenderedQrLabel> {
    const qrSvg = await QRCode.toString(input.url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: { dark: "#111111", light: "#ffffff" },
    });
    const encodedQr = Buffer.from(qrSvg, "utf8").toString("base64");
    const safeFilenameCode = input.fallbackCode
      .slice(0, 19)
      .replace(/[^A-Z0-9-]/g, "-");
    const fallbackCode = escapeXml(input.fallbackCode.slice(0, 19));
    const title = `Simply Clean Equipment label ${fallbackCode}`;
    return {
      filename: `simply-clean-equipment-${safeFilenameCode}.svg`,
      svg:
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="576" viewBox="0 0 432 576" role="img" aria-labelledby="title description">` +
        `<title id="title">${title}</title>` +
        `<desc id="description">Scan this QR code or enter fallback code ${fallbackCode} in the authenticated Simply Clean application.</desc>` +
        `<rect width="432" height="576" fill="#ffffff"/>` +
        `<image x="56" y="48" width="320" height="320" href="data:image/svg+xml;base64,${encodedQr}"/>` +
        `<text x="216" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#111111">Simply Clean Equipment</text>` +
        `<text x="216" y="470" text-anchor="middle" font-family="monospace" font-size="26" letter-spacing="2" fill="#111111">${fallbackCode}</text>` +
        `</svg>`,
    };
  }
}
