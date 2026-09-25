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

export interface QrSheetMachine {
  url: string;
  fallbackCode: string;
  manufacturer: string | null;
  capacityLb: number | null;
  machineType: "washer" | "dryer" | "other";
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
): string {
  // Shrink first so normal labels stay compact. If a value is unusually long,
  // retain every character by wrapping into as many bounded-width lines as it
  // needs rather than silently truncating the printed identity.
  for (let size = baseSize; size >= 5; size -= 1) {
    const lines = wrapText(
      value,
      Math.max(8, Math.floor((baseChars * baseSize) / size)),
    );
    if (lines.length <= 2) {
      return lines
        .map((line, index) =>
          drawText(line, x, y - index * (size + 2), size, bold),
        )
        .join("");
    }
  }
  const lines = wrapText(value, baseChars * 2);
  return lines
    .map((line, index) => drawText(line, x, y - index * 7, 5, bold))
    .join("");
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
        const type =
          label.machineType[0]!.toUpperCase() + label.machineType.slice(1);
        content += drawText(
          "LAUNDRORAMA",
          x + 10,
          y + cellHeight - 20,
          8,
          true,
        );
        content += drawAdaptiveText(
          manufacturer,
          x + 10,
          y + cellHeight - 36,
          11,
          22,
          true,
        );
        const capacity =
          label.capacityLb == null
            ? `Capacity unknown - ${type}`
            : `${label.capacityLb} LB - ${type}`;
        content += drawText(capacity, x + 10, y + cellHeight - 61, 9);
        content += drawAdaptiveText(
          `Serial: ${label.serial ?? "Not recorded"}`,
          x + 10,
          y + cellHeight - 76,
          8,
          25,
        );
        content += drawQr(label.url, x + (cellWidth - 112) / 2, y + 54, 112);
        content += drawText(
          `Fallback: ${label.fallbackCode}`,
          x + 10,
          y + 30,
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
