import { randomUUID } from "node:crypto";
import jsQrModule, { type Options, type QRCode } from "jsqr";
import { describe, expect, it } from "vitest";

import { QrLabelRenderer } from "../src/modules/inventory/qr/qr-label.renderer.js";
import { QrLabelSigner } from "../src/modules/inventory/qr/qr-label.signer.js";

type DecodeQr = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: Options,
) => QRCode | null;
const decodeQr = (
  "default" in jsQrModule ? jsQrModule.default : jsQrModule
) as DecodeQr;

function decodeEmbeddedQr(labelSvg: string): string | undefined {
  const encoded = /base64,([^"']+)/.exec(labelSvg)?.[1];
  if (!encoded) return undefined;
  const qrSvg = Buffer.from(encoded, "base64").toString("utf8");
  const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(qrSvg)?.[1]);
  const path = /<path stroke="#[0-9a-fA-F]+" d="([^"]+)"/.exec(qrSvg)?.[1];
  if (!Number.isInteger(size) || size <= 0 || !path) return undefined;

  const scale = 8;
  const width = size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const rowPath of path.split(/(?=M)/).filter(Boolean)) {
    const start = /^M(\d+) (\d+(?:\.\d+)?)/.exec(rowPath);
    if (!start) continue;
    let x = Number(start[1]);
    let y = Math.floor(Number(start[2]));
    const commands = rowPath.slice(start[0].length);
    for (const command of commands.matchAll(
      /([hm])(-?\d+(?:\.\d+)?)(?: (-?\d+(?:\.\d+)?))?/g,
    )) {
      const distance = Number(command[2]);
      if (command[1] === "m") {
        x += distance;
        y += Number(command[3] ?? 0);
        continue;
      }
      for (let moduleX = x; moduleX < x + distance; moduleX += 1) {
        for (let pixelY = y * scale; pixelY < (y + 1) * scale; pixelY += 1) {
          for (
            let pixelX = moduleX * scale;
            pixelX < (moduleX + 1) * scale;
            pixelX += 1
          ) {
            const offset = (pixelY * width + pixelX) * 4;
            pixels[offset] = 17;
            pixels[offset + 1] = 17;
            pixels[offset + 2] = 17;
          }
        }
      }
      x += distance;
    }
  }
  return decodeQr(pixels, width, width, {
    inversionAttempts: "dontInvert",
  })?.data;
}

describe("QR label signer", () => {
  const signer = new QrLabelSigner(
    "test-only-qr-secret-with-at-least-32-characters",
  );

  it("regenerates opaque signed versioned tokens deterministically", () => {
    const labelId = randomUUID();
    const token = signer.sign(labelId);
    expect(signer.sign(labelId)).toBe(token);
    expect(signer.verify(token)).toEqual({ version: 1, labelId });
    expect(token).not.toContain("machine");
    expect(token.split(".")).toHaveLength(3);
  });

  it("rejects forged, malformed, wrong-version, and guessed references", () => {
    const token = signer.sign(randomUUID());
    const forged = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(signer.verify(forged)).toBeNull();
    expect(signer.verify(token.replace(/^v1/, "v2"))).toBeNull();
    expect(signer.verify("v1.not-a-uuid.short")).toBeNull();
    expect(signer.verify(randomUUID())).toBeNull();
  });

  it("generates high-entropy Crockford fallback codes", () => {
    const codes = new Set(
      Array.from({ length: 128 }, () => signer.createFallbackCode()),
    );
    expect(codes.size).toBe(128);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
      expect(signer.normalizeFallbackCode(` ${code.toLowerCase()} `)).toBe(
        code,
      );
    }
    expect(signer.normalizeFallbackCode("MACHINE-ID")).toBeNull();
  });
});

describe("QR label renderer", () => {
  it("creates a private-printable minimal SVG with a decodable payload", async () => {
    const url =
      "https://platform.example.test/scan#v1.86bee7c3-380b-4a94-976d-4fe7d6ef8b3a.signature";
    const rendered = await new QrLabelRenderer().render({
      url,
      fallbackCode: "01ARZ3NDEKTSV4RR",
    });
    expect(rendered.filename).toBe(
      "laundrorama-equipment-01ARZ3NDEKTSV4RR.svg",
    );
    expect(rendered.svg).toContain('viewBox="0 0 432 576"');
    expect(rendered.svg).toContain('role="img"');
    expect(rendered.svg).toContain(
      '<title id="title">Laundrorama Equipment label 01ARZ3NDEKTSV4RR</title>',
    );
    expect(rendered.svg).toContain(
      "enter fallback code 01ARZ3NDEKTSV4RR in the authenticated Laundrorama application.",
    );
    expect(rendered.svg).toContain("Laundrorama Equipment");
    expect(rendered.svg).toContain("01ARZ3NDEKTSV4RR");
    const encoded = /base64,([^"']+)/.exec(rendered.svg)?.[1];
    expect(encoded).toBeDefined();
    expect(Buffer.from(encoded!, "base64").toString("utf8")).toContain("<svg");
    expect(decodeEmbeddedQr(rendered.svg)).toBe(url);
    expect(Buffer.from(encoded!, "base64").toString("utf8")).not.toContain(
      "86bee7c3-380b-4a94-976d-4fe7d6ef8b3a",
    );
    expect(rendered.svg).not.toContain("serial");
    expect(rendered.svg).not.toContain("model");
  });

  it("escapes renderer text inputs", async () => {
    const rendered = await new QrLabelRenderer().render({
      url: "https://platform.example.test/scan#safe",
      fallbackCode: "<script>&bad",
    });
    expect(rendered.svg).not.toContain("<script>");
    expect(rendered.svg).toContain("&lt;script&gt;&amp;bad");
  });

  it("renders a paginated nine-up PDF sheet with readable label facts", async () => {
    const rendered = await new QrLabelRenderer().renderSheet({
      labels: Array.from({ length: 10 }, (_, index) => ({
        url: `https://platform.example.test/scan#label-${index}`,
        fallbackCode: `01ARZ3NDEKTSV4R${index}`,
        manufacturer: "Dexter",
        model: index === 9 ? null : "T-400",
        capacityLb: index === 9 ? null : 40,
        machineType: "washer" as const,
        serial: `SERIAL-${index}`,
      })),
    });
    expect(rendered.filename).toBe("laundrorama-intake-qr-labels-10.pdf");
    expect(rendered.pdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(rendered.pdf.toString()).toContain("Dexter");
    expect(rendered.pdf.toString()).toContain("40 LB - Washer");
    expect(rendered.pdf.toString()).toContain("Capacity unknown - Washer");
    expect(rendered.pdf.toString()).toContain("Model: T-400");
    expect(rendered.pdf.toString()).toContain("Model: Not recorded");
    expect(rendered.pdf.toString()).toContain("Serial: SERIAL-9");
    expect(rendered.pdf.toString()).toContain("SERIAL-9");
    const pdfText = rendered.pdf.toString();
    const firstLabelText = pdfText.indexOf("(LAUNDRORAMA)");
    expect(firstLabelText).toBeGreaterThan(-1);
    expect(pdfText.lastIndexOf("0 0 0 rg", firstLabelText)).toBeGreaterThan(
      pdfText.lastIndexOf("1 1 1 rg", firstLabelText),
    );
    expect(
      (rendered.pdf.toString().match(/\/Type \/Page /g) ?? []).length,
    ).toBe(2);
    const firstSerial =
      /BT \/F1 8 Tf [\d.]+ ([\d.]+) Td \(Serial: SERIAL-0\) Tj ET/.exec(
        pdfText,
      );
    const firstQr = pdfText.slice(
      pdfText.indexOf("(Serial: SERIAL-0)"),
      pdfText.indexOf("(Fallback:"),
    );
    const qrTop = Math.max(
      ...Array.from(
        firstQr.matchAll(/[\d.]+ ([\d.]+) [\d.]+ ([\d.]+) re f/g),
        ([, y, height]) => Number(y) + Number(height),
      ),
    );
    expect(firstSerial).not.toBeNull();
    expect(Number(firstSerial![1]) - qrTop).toBeGreaterThanOrEqual(12);
    expect(pdfText).not.toContain("https://platform.example.test/scan#label-");
  });

  it("keeps long visible identity values within a label without truncating them", async () => {
    const manufacturer = `MAKER-${"A".repeat(74)}`;
    const model = `MODEL-${"B".repeat(94)}`;
    const serial = `SERIAL-${"C".repeat(94)}`;
    const rendered = await new QrLabelRenderer().renderSheet({
      labels: [
        {
          url: "https://platform.example.test/scan#v1.long-test-token",
          fallbackCode: "01ARZ3NDEKTSV4RR",
          manufacturer,
          model,
          serial,
          capacityLb: null,
          machineType: "washer",
        },
      ],
    });
    const pdf = rendered.pdf.toString();
    const identity = pdf.slice(
      pdf.indexOf("(LAUNDRORAMA)"),
      pdf.indexOf("(Fallback:"),
    );
    const identityText = identity.slice(0, identity.indexOf("0 0 0 rg"));
    const printed = Array.from(
      identity.matchAll(/\(([^)]*)\) Tj ET/g),
      ([, line]) => line,
    ).join("");
    expect(printed).toContain(manufacturer);
    expect(printed.replaceAll(" ", "")).toContain(`Model:${model}`);
    expect(printed.replaceAll(" ", "")).toContain(`Serial:${serial}`);
    const textBaselines = Array.from(
      identityText.matchAll(/BT \/F[12] [\d.]+ Tf [\d.]+ ([\d.]+) Td/g),
      ([, y]) => Number(y),
    );
    const qrRects = Array.from(
      identity.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re f/g),
      ([, x, y, width, height]) => ({
        x: Number(x),
        y: Number(y),
        width: Number(width),
        height: Number(height),
      }),
    );
    expect(
      textBaselines.every((baseline) => baseline > 525.33 && baseline < 768),
    ).toBe(true);
    expect(
      qrRects.every(
        ({ x, y, width, height }) =>
          x > 24 && x + width < 212 && y > 525.33 && y + height < 768,
      ),
    ).toBe(true);
    expect(
      Math.min(...textBaselines) -
        Math.max(...qrRects.map(({ y, height }) => y + height)),
    ).toBeGreaterThan(0);
  });
});
