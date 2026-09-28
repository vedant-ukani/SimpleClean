import { Injectable } from "@nestjs/common";
import QRCode from "qrcode";
import {
  equipmentClassLabel,
  type EquipmentClass,
} from "@laundrorama/contracts";

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

export interface QrSheetMachine {
  url: string;
  fallbackCode: string;
  manufacturer: string | null;
  model: string | null;
  capacityLb: number | null;
  machineType: "washer" | "dryer" | "other";
  equipmentClass?: EquipmentClass | null;
  serial: string | null;
}

export interface RenderedQrSheet {
  pdf: Buffer;
  filename: string;
}

function pdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/[\\()]/g, "\\$&")
    .replace(/[\r\n]/g, " ");
}

function pdfNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function drawText(
  text: string,
  x: number,
  y: number,
  size: number,
  bold = false,
): string {
  return `BT /${bold ? "F2" : "F1"} ${pdfNumber(size)} Tf ${pdfNumber(x)} ${pdfNumber(y)} Td (${pdfText(text)}) Tj ET\n`;
}

function wrapText(value: string, maxChars: number): string[] {
  const normalized = value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return ["Not recorded"];
  const lines: string[] = [];
  let line = "";
  for (const word of normalized.split(" ")) {
    if (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let offset = 0; offset < word.length; offset += maxChars)
        lines.push(word.slice(offset, offset + maxChars));
      continue;
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawAdaptiveText(
  value: string,
  x: number,
  y: number,
  baseSize: number,
  baseChars: number,
  bold = false,
  scale = 1,
): { content: string; lastBaseline: number } {
  // Shrink first so normal labels stay compact. If a value is unusually long,
  // retain every character by wrapping into as many bounded-width lines as it
  // needs rather than silently truncating the printed identity.
  const minimumSize = scale === 1 ? 5 : 3.5;
  for (let size = baseSize * scale; size >= minimumSize; size -= 0.5) {
    const lines = wrapText(
      value,
      Math.max(8, Math.floor((baseChars * baseSize) / size)),
    );
    if (lines.length <= 2) {
      const step = size + 2 * scale;
      return {
        content: lines
          .map((line, index) => drawText(line, x, y - index * step, size, bold))
          .join(""),
        lastBaseline: y - (lines.length - 1) * step,
      };
    }
  }
  const lines = wrapText(
    value,
    Math.max(8, Math.floor((baseChars * baseSize) / minimumSize)),
  );
  const step = minimumSize + 2 * scale;
  return {
    content: lines
      .map((line, index) =>
        drawText(line, x, y - index * step, minimumSize, bold),
      )
      .join(""),
    lastBaseline: y - (lines.length - 1) * step,
  };
}

function drawQr(url: string, x: number, y: number, size: number): string {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const modules = qr.modules as unknown as {
    size: number;
    data: readonly boolean[];
  };
  const moduleSize = size / modules.size;
  let content = "0 0 0 rg\n";
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (!modules.data[row * modules.size + column]) continue;
      const px = x + column * moduleSize;
      const py = y + (modules.size - row - 1) * moduleSize;
      content += `${pdfNumber(px)} ${pdfNumber(py)} ${pdfNumber(moduleSize + 0.05)} ${pdfNumber(moduleSize + 0.05)} re f\n`;
    }
  }
  return content;
}

function buildPdf(pages: string[]): Buffer {
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  const pageIds: number[] = [];
  for (const content of pages) {
    const contentId = objects.length + 1;
    objects.push(
      `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}endstream`,
    );
    const pageId = objects.length + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let output = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(output, "utf8"));
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1)
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "utf8");
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
    const title = `Laundrorama Equipment label ${fallbackCode}`;
    return {
      filename: `laundrorama-equipment-${safeFilenameCode}.svg`,
      svg:
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="576" viewBox="0 0 432 576" role="img" aria-labelledby="title description">` +
        `<title id="title">${title}</title>` +
        `<desc id="description">Scan this QR code or enter fallback code ${fallbackCode} in the authenticated Laundrorama application.</desc>` +
        `<rect width="432" height="576" fill="#ffffff"/>` +
        `<image x="56" y="48" width="320" height="320" href="data:image/svg+xml;base64,${encodedQr}"/>` +
        `<text x="216" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#111111">Laundrorama Equipment</text>` +
        `<text x="216" y="470" text-anchor="middle" font-family="monospace" font-size="26" letter-spacing="2" fill="#111111">${fallbackCode}</text>` +
        `</svg>`,
    };
  }

  async renderSheet(input: {
    labels: readonly QrSheetMachine[];
  }): Promise<RenderedQrSheet> {
    const pages: string[] = [];
    const margin = 24;
    const gutter = 8;
    const cellWidth = (612 - margin * 2 - gutter * 2) / 3;
    const cellHeight = (792 - margin * 2 - gutter * 2) / 3;
    for (let pageStart = 0; pageStart < input.labels.length; pageStart += 9) {
      let content = "1 1 1 rg 0 0 612 792 re f\n";
      const pageLabels = input.labels.slice(pageStart, pageStart + 9);
      pageLabels.forEach((label, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const x = margin + column * (cellWidth + gutter);
        const y = 792 - margin - (row + 1) * cellHeight - row * gutter;
        content += `0.85 0.85 0.85 RG ${pdfNumber(x)} ${pdfNumber(y)} ${pdfNumber(cellWidth)} ${pdfNumber(cellHeight)} re S\n`;
        // The page background leaves the non-stroking fill color white. Reset
        // it before every label so the first label's human-readable text is
        // visible just like labels rendered after a black QR code.
        content += "0 0 0 rg\n";
        const manufacturer = label.manufacturer ?? "Unknown manufacturer";
        const type = label.equipmentClass
          ? equipmentClassLabel(label.equipmentClass)
          : label.machineType[0]!.toUpperCase() + label.machineType.slice(1);
        const capacity =
          label.capacityLb == null
            ? `Capacity unknown - ${type}`
            : `${label.capacityLb} LB - ${type}`;
        const top = y + cellHeight;
        const identity = (scale: number) => {
          const title = drawText(
            "LAUNDRORAMA",
            x + 10,
            top - 20 * scale,
            8 * scale,
            true,
          );
          const maker = drawAdaptiveText(
            manufacturer,
            x + 10,
            top - 36 * scale,
            11,
            22,
            true,
            scale,
          );
          const capacityLine = drawAdaptiveText(
            capacity,
            x + 10,
            Math.min(top - 61 * scale, maker.lastBaseline - 12 * scale),
            9,
            32,
            false,
            scale,
          );
          const model = drawAdaptiveText(
            `Model: ${label.model ?? "Not recorded"}`,
            x + 10,
            capacityLine.lastBaseline - 16 * scale,
            8,
            25,
            false,
            scale,
          );
          const serial = drawAdaptiveText(
            `Serial: ${label.serial ?? "Not recorded"}`,
            x + 10,
            model.lastBaseline - 17 * scale,
            8,
            25,
            false,
            scale,
          );
          const qrTop = Math.min(y + 134, serial.lastBaseline - 6 * scale);
          const qrSize = Math.min(96, qrTop - (y + 38));
          return {
            content:
              title +
              maker.content +
              capacityLine.content +
              model.content +
              serial.content,
            qrSize,
            qrTop,
          };
        };
        let layout = identity(1);
        if (layout.qrSize < 88) layout = identity(0.7);
        if (layout.qrSize < 88) layout = identity(0.6);
        content += layout.content;
        content += drawQr(
          label.url,
          x + (cellWidth - layout.qrSize) / 2,
          layout.qrTop - layout.qrSize,
          layout.qrSize,
        );
        content += drawText(
          `Fallback: ${label.fallbackCode}`,
          x + 10,
          y + 17,
          7,
          false,
        );
      });
      pages.push(content);
    }
    return {
      pdf: buildPdf(pages),
      filename: `laundrorama-intake-qr-labels-${input.labels.length}.pdf`,
    };
  }
}
